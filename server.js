import {publicOrigin as validatePublicOrigin} from './reconstruction/origin.js';
import {ReconstructionStore} from './reconstruction/store.js';
import {createReconstructionRouter} from './reconstruction/routes.js';
import {publicDish,invalidateModelAssets,modelIdentity} from './model-assets.js';
import express from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { calibrateGlb, inspectGlb } from './glb.js';
import {getFeatures, reconstructionDisabled} from './features.js';
import { openPlatform, hashPassword, verifyPassword, randomId, tokenHash, createSession, encrypt, decrypt } from './platform.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.MESA3D_DATA_DIR || path.join(root,'data'));
const uploadDir = path.join(dataDir,'uploads');
const storePath = path.join(dataDir,'store.json');
const publicDir = path.join(root,'public');
const app = express();
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '127.0.0.1';
const configuredPublicOrigin=process.env.MESA3D_PUBLIC_ORIGIN?validatePublicOrigin(process.env.MESA3D_PUBLIC_ORIGIN):null;

const photoUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:18*1024*1024,files:4}});
const modelUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:60*1024*1024,files:1}});
const uid = () => crypto.randomUUID();
const db=openPlatform(dataDir);
const reconstructionStore=new ReconstructionStore(db);
const requestStore=new AsyncLocalStorage();
const active=()=>{const value=requestStore.getStore();if(!value)throw new Error('Restaurante não selecionado.');return value.catalog};
const activeShop=()=>requestStore.getStore().shop;

const safeText = (value,max=200) => String(value ?? '').trim().slice(0,max);
const number = (value,min,max,label) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n<min || n>max) throw new Error(`${label} deve estar entre ${min} e ${max}.`);
  return n;
};
const mediaUrl = filename => `/media/${filename}`;
const mediaFilename = url => url?.startsWith('/media/') ? path.basename(url) : null;
function mobileModelReport(source,calibrated){
  const report=inspectGlb(source);
  if(report.bytes>20*1024*1024)throw new Error('O GLB excede 20 MB. Otimize texturas e geometria antes do teste no celular.');
  if(report.triangles>180000)throw new Error('O GLB excede 180 mil triângulos. Reduza a malha antes do teste no celular.');
  return {...report,actualSizeCm:calibrated.actualSizeCm,shapeDeviationPct:Number((calibrated.shapeDeviation*100).toFixed(1))};
}
async function writeStore() {
  const shop=activeShop();
  const result=db.prepare('UPDATE restaurants SET catalog=?, slug=?, version=version+1 WHERE id=? AND version=?')
    .run(JSON.stringify(active()),active().restaurant.slug,shop.id,shop.version);
  if(!result.changes)throw new Error('O cardápio mudou em outra sessão. Atualize a página e tente novamente.');
  shop.version++;
}
async function saveMedia(buffer,extension) {
  const name = `${uid()}.${extension}`;
  await fs.writeFile(path.join(uploadDir,name),buffer);
  return mediaUrl(name);
}
async function removeMedia(url) {
  const filename=mediaFilename(url);
  if(filename)await fs.unlink(path.join(uploadDir,filename)).catch(()=>{});
}
function publicState() {
  return {
    restaurant:active().restaurant,
    dishes:active().dishes,
    capabilities:getFeatures()
  };
}
function locate(dishId,portionId) {
  const dish=active().dishes.find(d=>d.id===dishId);
  const portion=dish?.portions.find(p=>p.id===portionId);
  if (!dish || !portion) throw new Error('Prato ou porção não encontrado.');
  return {dish,portion};
}
async function initStore() {
  await fs.mkdir(uploadDir,{recursive:true});
  if (db.prepare('SELECT COUNT(*) AS n FROM restaurants').get().n) return;
  let catalog;
  try {catalog=JSON.parse(await fs.readFile(storePath,'utf8'))} catch {}
  if (catalog && catalog.schemaVersion>=3) {
    db.prepare('INSERT INTO restaurants(id,slug,catalog,created_at) VALUES(?,?,?,?)')
      .run(uid(),catalog.restaurant.slug,JSON.stringify(catalog),new Date().toISOString());
    return;
  }
  const source=await fs.readFile(path.join(publicDir,'assets','filet-demo-optimized.glb'));
  const small={width:21,depth:19,height:4.5};
  const large={width:27,depth:25,height:5.5};
  const smallModel=await saveMedia(calibrateGlb(source,small).buffer,'glb');
  const largeModel=await saveMedia(calibrateGlb(source,large).buffer,'glb');
  catalog={schemaVersion:3,
    restaurant:{name:'Brasa & Raiz',slug:'brasa-e-raiz',tagline:'A mesa começa pelos olhos.',intro:'Cozinha de origem, feita para ser vista de perto. Escolha sua porção, compare o tamanho real e então decida o que pedir.',address:'Restaurante de demonstração',whatsapp:'',accent:'#b35739'},
    dishes:[{id:'demo-filet',name:'Filé na brasa com batatas rústicas',category:'Pratos principais',description:'Filé selado, batatas douradas, tomates confitados e ervas frescas. Um prato para saborear sem pressa.',allergens:'Pode conter leite',prepMinutes:25,featured:true,published:true,createdAt:new Date().toISOString(),portions:[
      {id:'demo-100',label:'Individual',grams:100,price:42.9,dimensions:small,upAxis:'auto',photos:['/assets/filet-demo.webp'],modelSource:'/assets/filet-demo-optimized.glb',modelUrl:smallModel,modelStatus:'ready',demo:true},
      {id:'demo-200',label:'Para compartilhar',grams:200,price:68.9,dimensions:large,upAxis:'auto',photos:['/assets/filet-demo.webp'],modelSource:'/assets/filet-demo-optimized.glb',modelUrl:largeModel,modelStatus:'ready',demo:true}
    ]}]
  };
  db.prepare('INSERT INTO restaurants(id,slug,catalog,created_at) VALUES(?,?,?,?)')
    .run(uid(),catalog.restaurant.slug,JSON.stringify(catalog),new Date().toISOString());
}

app.disable('x-powered-by');
app.set('trust proxy',1);
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(self), microphone=()');
  res.setHeader('X-Frame-Options','DENY');
  if (req.method!=='GET' && req.method!=='HEAD' && req.method!=='OPTIONS') {
    const origin=req.get('origin');
    if (origin && origin!==`${req.protocol}://${req.get('host')}`) return res.status(403).json({error:'Origem inválida.'});
  }
  next();
});
app.use(express.json({limit:'1mb'}));
// A private pilot needs an interactive gate for pages and APIs. Native Android
// Scene Viewer fetches GLBs outside the browser, so opaque media URLs stay
// reachable without the browser cookie; never put secrets in media filenames.
const pilotCode=String(process.env.PILOT_ACCESS_CODE||'').trim();
const pilotToken=pilotCode?crypto.createHash('sha256').update(`mesa3d-pilot:${pilotCode}:${process.env.MESA3D_ENCRYPTION_KEY||''}`).digest('base64url'):'';
const pilotAttempts=new Map();
app.get('/api/health',(req,res)=>res.json({ok:true}));
app.post('/api/pilot/access',(req,res)=>{
  if(!pilotCode)return res.status(404).json({error:'Convite não configurado.'});
  const key=req.ip, now=Date.now(), record=pilotAttempts.get(key)||{count:0,until:0};
  if(record.until>now)return res.status(429).json({error:'Muitas tentativas. Aguarde 15 minutos.'});
  const supplied=Buffer.from(String(req.body?.code||'').trim());
  const expected=Buffer.from(pilotCode);
  const valid=supplied.length===expected.length&&crypto.timingSafeEqual(supplied,expected);
  if(!valid){
    record.count++;record.until=record.count>=8?now+15*60000:0;
    pilotAttempts.set(key,record);
    return res.status(401).json({error:'Código de convite incorreto.'});
  }
  pilotAttempts.delete(key);
  res.cookie('mesa3d_pilot',pilotToken,{httpOnly:true,sameSite:'lax',secure:req.secure,path:'/',maxAge:24*3600000});
  res.json({ok:true});
});
app.use((req,res,next)=>{
  if(!pilotCode || req.path==='/api/health' || req.path==='/convite.html' || req.path==='/convite.js' || req.path==='/styles.css' || req.path.startsWith('/assets/') || req.path.startsWith('/media/') || req.path.startsWith('/vendor/'))return next();
  const cookie=/(?:^|;\s*)mesa3d_pilot=([^;]+)/.exec(req.headers.cookie||'')?.[1]||'';
  const value=Buffer.from(cookie),expected=Buffer.from(pilotToken);
  if(value.length===expected.length&&crypto.timingSafeEqual(value,expected))return next();
  if(req.path.startsWith('/api/'))return res.status(401).json({error:'Informe o código de convite para abrir este teste.'});
  const back=req.originalUrl.startsWith('/')&&!req.originalUrl.startsWith('//')?req.originalUrl:'/';
  res.redirect(`/convite.html?voltar=${encodeURIComponent(back)}`);
});
function getUser(req) {
  const token=/(?:^|;\s*)mesa3d_session=([^;]+)/.exec(req.headers.cookie||'')?.[1];
  if (!token) return null;
  const row=db.prepare('SELECT users.id,users.email,users.role,users.restaurant_id FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(tokenHash(token),Date.now());
  return row||null;
}
function requireUser(req,res,next) {
  req.user=getUser(req);
  if (!req.user) return res.status(401).json({error:'Faça login para continuar.'});
  next();
}
function requireOwner(req,res,next) {
  if(req.user?.role!=='owner')return res.status(403).json({error:'Acesso reservado à administração.'});
  next();
}
function shopContext(req,res,next) {
  const id=req.user.role==='owner' && req.query.loja
    ? db.prepare('SELECT id FROM restaurants WHERE slug=?').get(String(req.query.loja))?.id
    : req.user.restaurant_id || db.prepare('SELECT id FROM restaurants ORDER BY created_at LIMIT 1').get()?.id;
  const shop=id&&db.prepare('SELECT * FROM restaurants WHERE id=?').get(id);
  if(!shop)return res.status(404).json({error:'Restaurante não encontrado.'});
  requestStore.run({shop,catalog:JSON.parse(shop.catalog)},next);
}
function publicContext(req,res,next) {
  const slug=String(req.query.loja||'');
  const shop=slug ? db.prepare('SELECT * FROM restaurants WHERE slug=?').get(slug)
    : db.prepare('SELECT * FROM restaurants ORDER BY created_at LIMIT 1').get();
  if(!shop)return res.status(404).json({error:'Cardápio não encontrado.'});
  requestStore.run({shop,catalog:JSON.parse(shop.catalog)},next);
}
const attempts=new Map();
const orderAttempts=new Map();
app.post('/api/auth/login',(req,res,next)=>{try{
  const email=safeText(req.body?.email,150).toLowerCase(),password=String(req.body?.password||'');
  const key=`${req.ip}:${email}`, record=attempts.get(key)||{count:0,until:0};
  if(record.until>Date.now())return res.status(429).json({error:'Aguarde alguns minutos antes de tentar novamente.'});
  const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if(!user || !verifyPassword(password,user.password)){
    record.count++;record.until=record.count>=5?Date.now()+15*60000:0;attempts.set(key,record);
    return res.status(401).json({error:'E-mail ou senha incorretos.'});
  }
  attempts.delete(key);
  const token=createSession(db,user.id);
  res.cookie('mesa3d_session',token,{httpOnly:true,sameSite:'strict',secure:req.secure,path:'/',maxAge:7*86400000});
  res.json({role:user.role,restaurantId:user.restaurant_id});
}catch(e){next(e)}});
app.post('/api/auth/logout',requireUser,(req,res)=>{
  const token=/(?:^|;\s*)mesa3d_session=([^;]+)/.exec(req.headers.cookie||'')?.[1];
  if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));
  res.clearCookie('mesa3d_session',{path:'/'}).json({ok:true});
});
app.get('/api/auth/me',requireUser,(req,res)=>res.json({email:req.user.email,role:req.user.role,restaurantId:req.user.restaurant_id}));
app.post('/api/auth/password',requireUser,(req,res,next)=>{try{
  const user=db.prepare('SELECT password FROM users WHERE id=?').get(req.user.id);
  if(!verifyPassword(req.body?.currentPassword,user.password))return res.status(403).json({error:'Senha atual incorreta.'});
  db.prepare('UPDATE users SET password=? WHERE id=?').run(hashPassword(req.body?.newPassword),req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(req.user.id,tokenHash(/(?:^|;\s*)mesa3d_session=([^;]+)/.exec(req.headers.cookie||'')?.[1]||''));
  res.json({ok:true});
}catch(e){next(e)}});
app.get('/studio.html',(req,res)=>{
  const user=getUser(req);
  if(!user)return res.redirect('/acesso.html');
  res.sendFile(path.join(publicDir,'studio.html'));
});
app.get('/owner.html',(req,res)=>{
  const user=getUser(req);
  if(user?.role!=='owner')return res.redirect('/acesso.html');
  res.sendFile(path.join(publicDir,'owner.html'));
});
app.use('/media',express.static(uploadDir,{setHeaders:(res,file)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  if (file.endsWith('.glb')) res.setHeader('Content-Type','model/gltf-binary');
  if (file.endsWith('.usdz')) res.setHeader('Content-Type','model/vnd.usdz+zip');
  res.setHeader('Cache-Control',/^model-[a-f0-9]{64}\.(glb|usdz)$/.test(path.basename(file))?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate');
}}));
app.get('/vendor/model-viewer.min.js',(req,res)=>res.sendFile(path.join(root,'node_modules','@google','model-viewer','dist','model-viewer.min.js')));
app.get('/cardapio/:slug',(req,res)=>{
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(req.params.slug))return res.sendStatus(404);
  res.redirect('/?loja='+encodeURIComponent(req.params.slug));
});
app.get(['/cardapio/:slug/:id','/cardapio/:slug/:id/{*rest}'],(req,res)=>res.status(404).sendFile(path.join(publicDir,'cardapio-legado.html')));
app.use(express.static(publicDir));

app.get('/api/state',publicContext,(req,res)=>res.json({
  restaurant:active().restaurant,
  dishes:active().dishes.filter(d=>d.published).map(publicDish),
  capabilities:{...getFeatures(),payments:Boolean(activeShop().mp_credentials && process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET)}
}));
// Laboratório 3D: análise sem gravar mídia nem alterar o restaurante.
app.post('/api/lab/analyze',requireUser,modelUpload.single('model'),(req,res,next)=>{try{
  if(!req.file)throw new Error('Selecione um GLB para analisar.');
  const original=inspectGlb(req.file.buffer);
  const response={valid:true,...original,limits:{maxBytes:20*1024*1024,maxTriangles:180000},
    mobileReady:original.bytes<=20*1024*1024&&original.triangles<=180000};
  const width=Number(req.body.width),depth=Number(req.body.depth),height=Number(req.body.height);
  if([width,depth,height].every(n=>Number.isFinite(n)&&n>0)){
    const axis=['auto','y','z'].includes(req.body.upAxis)?req.body.upAxis:'auto';
    try{
      const calibrated=calibrateGlb(req.file.buffer,{width,depth,height},axis,true);
      response.calibration={ok:true,upAxis:calibrated.upAxis,
        actualSizeCm:calibrated.actualSizeCm,
        deviationPct:Number((calibrated.shapeDeviation*100).toFixed(2))};
    }catch(error){response.calibration={ok:false,reason:error.message};}
  }
  res.json(response);
}catch(error){next(error)}});

app.use('/api/reconstruction',createReconstructionRouter({db,store:reconstructionStore,dataDir,requireUser,shopContext,getShop:()=>activeShop(),getCatalog:()=>active()}));
app.get('/api/local3d/status',requireUser,(req,res)=>res.json({ready:false,enabled:false}));
app.use('/api/local3d',requireUser,reconstructionDisabled);
app.get('/api/manage/state',requireUser,shopContext,(req,res)=>res.json(publicState()));
app.use('/api/restaurant',requireUser,shopContext);
app.use('/api/dishes',requireUser,shopContext);
app.put('/api/restaurant',async(req,res,next)=>{try{
  const x=req.body || {};
  const name=safeText(x.name,70), slug=safeText(x.slug,65).toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
  if (!name || !slug) throw new Error('Informe nome e endereço do cardápio.');
  active().restaurant={name,slug,tagline:safeText(x.tagline,100),intro:safeText(x.intro,400),address:safeText(x.address,140),whatsapp:safeText(x.whatsapp,30).replace(/\D/g,''),accent:'#b35739'};
  await writeStore(); res.json(publicState());
}catch(e){next(e)}});
app.post('/api/dishes',async(req,res,next)=>{try{
  const x=req.body || {};
  const name=safeText(x.name,90), category=safeText(x.category,45);
  if (!name || !category) throw new Error('Informe nome e categoria do prato.');
  if (!Array.isArray(x.portions) || !x.portions.length || x.portions.length>6) throw new Error('Cadastre de uma a seis porções.');
  const previous=active().dishes.find(d=>d.id===x.id);
  const ids=new Set();
  const portions=[];
  for (const raw of x.portions) {
    const id=typeof raw.id==='string' && /^[\w-]{5,80}$/.test(raw.id) ? raw.id : uid();
    if (ids.has(id)) throw new Error('Porções duplicadas.'); ids.add(id);
    const old=previous?.portions.find(p=>p.id===id);
    const dims={width:number(raw.dimensions?.width,3,150,'Largura'),depth:number(raw.dimensions?.depth,3,150,'Profundidade'),height:number(raw.dimensions?.height,0.5,100,'Altura')};
    const upAxis=['auto','y','z'].includes(raw.upAxis)?raw.upAxis:'auto';
    const portion={id,label:safeText(raw.label,50)||'Porção',grams:number(raw.grams,1,10000,'Peso'),price:number(raw.price,0,100000,'Preço'),dimensions:dims,upAxis,
      modelAssets:old?.modelAssets,reviewedAt:old?.reviewedAt,reviewedBy:old?.reviewedBy,photos:old?.photos || [],modelSource:old?.modelSource || '',modelUrl:old?.modelUrl || '',modelStatus:old?.modelStatus || 'missing',modelReport:old?.modelReport || null,jobId:old?.jobId || '',demo:old?.demo || false};
    if (portion.modelSource && (JSON.stringify(dims)!==JSON.stringify(old?.dimensions) || upAxis!==old?.upAxis)) {
      const filename=mediaFilename(portion.modelSource);
      const source=filename ? await fs.readFile(path.join(uploadDir,filename)) : await fs.readFile(path.join(publicDir,portion.modelSource.replace(/^\//,'')));
      const calibrated=calibrateGlb(source,dims,upAxis,!portion.demo);
      if(!portion.demo)portion.modelReport=mobileModelReport(source,calibrated);
      portion.modelUrl=await saveMedia(calibrated.buffer,'glb');
      portion.modelStatus=portion.demo?'ready':'review';
      invalidateModelAssets(portion);
    }
    portions.push(portion);
  }
  const dish={id:previous?.id || uid(),name,category,description:safeText(x.description,600),allergens:safeText(x.allergens,120),prepMinutes:number(x.prepMinutes ?? 0,0,360,'Preparo'),featured:Boolean(x.featured),published:Boolean(x.published),createdAt:previous?.createdAt || new Date().toISOString(),portions};
  if (previous) active().dishes[active().dishes.indexOf(previous)]=dish; else active().dishes.unshift(dish);
  await writeStore(); res.json(dish);
}catch(e){next(e)}});
app.delete('/api/dishes/:id',async(req,res,next)=>{try{
  const index=active().dishes.findIndex(d=>d.id===req.params.id);
  if (index<0) return res.status(404).json({error:'Prato não encontrado.'});
  const [removed]=active().dishes.splice(index,1); await writeStore();
  for(const portion of removed.portions)for(const url of [...portion.photos,portion.modelSource,portion.modelUrl])await removeMedia(url);
  res.json({ok:true});
}catch(e){next(e)}});
app.post('/api/dishes/:dishId/portions/:portionId/photos',photoUpload.array('photos',4),async(req,res,next)=>{try{
  const {portion}=locate(req.params.dishId,req.params.portionId);
  if (!req.files?.length) throw new Error('Selecione até quatro fotos.');
  const photos=[];
  for (const file of req.files) {
    const jpeg=file.buffer[0]===0xff&&file.buffer[1]===0xd8;
    const png=file.buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    if (!jpeg && !png) throw new Error('Use fotos JPG ou PNG.');
    photos.push(await saveMedia(file.buffer,jpeg?'jpg':'png'));
  }
  const previous=[...portion.photos,portion.modelSource,portion.modelUrl];
  portion.photos=photos; portion.modelSource=''; portion.modelUrl=''; portion.modelStatus='missing'; portion.modelReport=null; portion.jobId=''; portion.demo=false;
  invalidateModelAssets(portion);
  await writeStore(); res.json(portion);
  for(const url of previous)await removeMedia(url);
}catch(e){next(e)}});
app.post('/api/dishes/:dishId/portions/:portionId/model',modelUpload.single('model'),async(req,res,next)=>{try{
  const {portion}=locate(req.params.dishId,req.params.portionId);
  if (!req.file) throw new Error('Selecione um arquivo GLB.');
  const calibrated=calibrateGlb(req.file.buffer,portion.dimensions,portion.upAxis,true);
  const report=mobileModelReport(req.file.buffer,calibrated);
  portion.modelSource=await saveMedia(req.file.buffer,'glb');
  portion.modelUrl=await saveMedia(calibrated.buffer,'glb');
  portion.modelStatus='review'; portion.modelReport=report; portion.jobId=''; portion.demo=false;
  invalidateModelAssets(portion);
  await writeStore(); res.json({portion,nativeSize:calibrated.nativeSize,report});
}catch(e){next(e)}});
app.post('/api/dishes/:dishId/portions/:portionId/generate',reconstructionDisabled);
app.get('/api/dishes/:dishId/portions/:portionId/job',reconstructionDisabled);
app.post('/api/dishes/:dishId/portions/:portionId/approve',async(req,res,next)=>{try{
  const {portion}=locate(req.params.dishId,req.params.portionId);
  if(portion.modelStatus!=='review' || !portion.modelUrl)throw new Error('Não há modelo aguardando revisão.');
  if(!portion.photos?.length)throw new Error('Envie foto da porção real antes de aprovar o 3D.');
  if(req.body?.shapeConfirmed!==true||req.body?.scaleConfirmed!==true)throw new Error('Confirme a fidelidade e a escala no celular antes de aprovar.');
  portion.modelStatus='ready';portion.reviewedAt=new Date().toISOString();portion.reviewedBy=req.user.id;
  await writeStore();res.json(portion);
}catch(e){next(e)}});
app.get('/api/qr.svg',async(req,res,next)=>{try{
  const url=new URL(String(req.query.url || ''));
  if(configuredPublicOrigin&&url.origin!==configuredPublicOrigin)throw new Error('Use o domínio público configurado para o QR Code.');
  if (!['http:','https:'].includes(url.protocol) || url.href.length>500) throw new Error('Link inválido.');
  res.type('image/svg+xml').send(await QRCode.toString(url.href,{type:'svg',margin:1,width:320,color:{dark:'#18352e',light:'#fffaf1'}}));
}catch(e){next(e)}});

// Platform administration is deliberately absent from public navigation.
app.get('/api/owner/restaurants',requireUser,requireOwner,(req,res)=>{
  const shops=db.prepare('SELECT id,slug,catalog,mp_credentials,created_at FROM restaurants ORDER BY created_at DESC').all();
  res.json(shops.map(s=>{
    const catalog=JSON.parse(s.catalog), users=db.prepare("SELECT email FROM users WHERE restaurant_id=? AND role='restaurant'").all(s.id);
    const orders=db.prepare('SELECT COUNT(*) AS n FROM orders WHERE restaurant_id=?').get(s.id).n;
    const lastBill=db.prepare('SELECT status,created_at FROM billing WHERE restaurant_id=? ORDER BY created_at DESC LIMIT 1').get(s.id);
    return {id:s.id,slug:s.slug,name:catalog.restaurant.name,users:users.map(u=>u.email),dishes:catalog.dishes.length,orders,connected:Boolean(s.mp_credentials),lastBill,createdAt:s.created_at};
  }));
});
app.post('/api/owner/restaurants',requireUser,requireOwner,(req,res,next)=>{try{
  const name=safeText(req.body?.name,70), slug=safeText(req.body?.slug,65).toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,''),email=safeText(req.body?.email,150).toLowerCase();
  if(!name||!slug)throw new Error('Preencha nome e endereço do restaurante.');
  const requestedPassword=String(req.body?.password||'');
  if(Boolean(email)!==Boolean(requestedPassword))throw new Error('Para criar acesso separado, informe e-mail e senha juntos.');
  if(email&&!/^\S+@\S+\.\S+$/.test(email))throw new Error('Informe um e-mail válido.');
  const password=email?hashPassword(requestedPassword):null;
  const id=uid(),catalog={schemaVersion:4,restaurant:{name,slug,tagline:'',intro:'',address:'',whatsapp:'',accent:'#b35739'},dishes:[]};
  db.exec('BEGIN');
  try{
    db.prepare('INSERT INTO restaurants(id,slug,catalog,created_at) VALUES(?,?,?,?)').run(id,slug,JSON.stringify(catalog),new Date().toISOString());
    if(email)db.prepare('INSERT INTO users(id,email,password,role,restaurant_id,created_at) VALUES(?,?,?,?,?,?)').run(uid(),email,password,'restaurant',id,new Date().toISOString());
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
  res.status(201).json({id,slug,name,email});
}catch(e){next(e)}});
app.post('/api/owner/restaurants/:id/password',requireUser,requireOwner,(req,res,next)=>{try{
  const password=hashPassword(req.body?.password);
  const user=db.prepare("SELECT id FROM users WHERE restaurant_id=? AND role='restaurant'").get(req.params.id);
  if(!user)return res.status(404).json({error:'Conta não encontrada.'});
  db.prepare('UPDATE users SET password=? WHERE id=?').run(password,user.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
  res.json({ok:true});
}catch(e){next(e)}});
app.get('/api/manage/orders',requireUser,shopContext,(req,res)=>{
  const rows=db.prepare('SELECT * FROM orders WHERE restaurant_id=? ORDER BY created_at DESC LIMIT 200').all(activeShop().id);
  res.json(rows.map(row=>({...row,items:JSON.parse(row.items)})));
});
app.patch('/api/manage/orders/:id',requireUser,shopContext,(req,res)=>{
  const status=String(req.body?.status||'');
  if(!['awaiting_payment','received','preparing','ready','delivered','cancelled'].includes(status))return res.status(400).json({error:'Status inválido.'});
  const result=db.prepare('UPDATE orders SET status=? WHERE id=? AND restaurant_id=?').run(status,req.params.id,activeShop().id);
  res.status(result.changes?200:404).json(result.changes?{ok:true}:{error:'Pedido não encontrado.'});
});
app.post('/api/orders',(req,res,next)=>{
  const key=req.ip,now=Date.now(),recent=(orderAttempts.get(key)||[]).filter(t=>now-t<3600000);
  if(recent.length>=30)return res.status(429).json({error:'Muitos pedidos deste endereço. Tente mais tarde.'});
  recent.push(now);orderAttempts.set(key,recent);next();
},publicContext,(req,res,next)=>{try{
  const requested=req.body?.items;
  if(!Array.isArray(requested)||!requested.length||requested.length>30)throw new Error('Selecione até 30 itens.');
  const items=requested.map(item=>{
    const dish=active().dishes.find(d=>d.id===item.dishId&&d.published);
    const portion=dish?.portions.find(p=>p.id===item.portionId);
    const qty=number(item.qty,1,20,'Quantidade');
    if(!portion||portion.demo||!Number.isInteger(qty))throw new Error('Item indisponível.');
    return {dishId:dish.id,portionId:portion.id,name:dish.name,portion:portion.label,qty,unitCents:Math.round(portion.price*100)};
  });
  const total=items.reduce((n,i)=>n+i.qty*i.unitCents,0);
  if(total<0||total>10000000)throw new Error('Valor inválido.');
  const customerName=safeText(req.body?.customerName,100),tableNumber=safeText(req.body?.tableNumber,30);
  if(!customerName||!tableNumber)throw new Error('Informe nome e mesa ou comanda.');
  const id=uid();
  db.prepare('INSERT INTO orders(id,restaurant_id,items,customer_name,table_number,notes,total_cents,status,payment_status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id,activeShop().id,JSON.stringify(items),customerName,tableNumber,safeText(req.body?.notes,500),total,req.body?.paymentIntent?'awaiting_payment':'received','unpaid',new Date().toISOString());
  res.status(201).json({id,totalCents:total,paymentAvailable:Boolean(activeShop().mp_credentials),status:req.body?.paymentIntent?'awaiting_payment':'received'});
}catch(e){next(e)}});
app.get('/api/orders/:id',(req,res)=>{
  const order=db.prepare('SELECT id,restaurant_id,total_cents,status,payment_status,created_at FROM orders WHERE id=?').get(req.params.id);
  if(!order)return res.status(404).json({error:'Pedido não encontrado.'});
  const shop=db.prepare('SELECT slug,catalog,mp_credentials FROM restaurants WHERE id=?').get(order.restaurant_id);
  res.json({id:order.id,totalCents:order.total_cents,status:order.status,paymentStatus:order.payment_status,createdAt:order.created_at,restaurant:JSON.parse(shop.catalog).restaurant.name,slug:shop.slug,paymentAvailable:Boolean(shop.mp_credentials)});
});

const baseUrl=()=>String(process.env.PUBLIC_BASE_URL||'').replace(/\/$/,'');
async function mpJson(endpoint,token,options={}) {
  const response=await fetch(`https://api.mercadopago.com${endpoint}`,{
    ...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(options.headers||{})},
    signal:AbortSignal.timeout(20000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||`Mercado Pago respondeu ${response.status}.`);
  return data;
}
async function merchantToken(shop) {
  let creds=decrypt(shop.mp_credentials);
  if(!creds)return null;
  if(creds.expiresAt>Date.now()+86400000)return creds.accessToken;
  if(!process.env.MP_CLIENT_ID||!process.env.MP_CLIENT_SECRET)throw new Error('Configuração Mercado Pago incompleta.');
  const body=new URLSearchParams({grant_type:'refresh_token',client_id:process.env.MP_CLIENT_ID,client_secret:process.env.MP_CLIENT_SECRET,refresh_token:creds.refreshToken});
  const response=await fetch('https://api.mercadopago.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(!response.ok||!data.access_token)throw new Error('Autorização Mercado Pago expirada. Reconecte a conta.');
  creds={accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:Date.now()+data.expires_in*1000,userId:data.user_id};
  db.prepare('UPDATE restaurants SET mp_credentials=? WHERE id=?').run(encrypt(creds),shop.id);
  return creds.accessToken;
}
async function createPreference(token,externalReference,items,returnPath) {
  if(!baseUrl().startsWith('https://'))throw new Error('Configure PUBLIC_BASE_URL com HTTPS para aceitar pagamentos.');
  const data=await mpJson('/checkout/preferences',token,{method:'POST',headers:{'X-Idempotency-Key':externalReference},body:JSON.stringify({
    items,external_reference:externalReference,
    payment_methods:{installments:1},
    back_urls:{success:`${baseUrl()}${returnPath}`,pending:`${baseUrl()}${returnPath}`,failure:`${baseUrl()}${returnPath}`},
    auto_return:'approved',
    notification_url:`${baseUrl()}/api/payments/webhook`
  })});
  if(!data.init_point || new URL(data.init_point).hostname!=='www.mercadopago.com.br')throw new Error('Link de pagamento inválido.');
  return data.init_point;
}
app.post('/api/orders/:id/checkout',async(req,res,next)=>{try{
  const order=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if(!order)return res.status(404).json({error:'Pedido não encontrado.'});
  if(order.status==='cancelled'||order.payment_status==='paid')return res.status(409).json({error:'Este pedido não pode ser pago novamente.'});
  const shop=db.prepare('SELECT * FROM restaurants WHERE id=?').get(order.restaurant_id);
  const token=await merchantToken(shop);
  if(!token)return res.status(409).json({error:'Este restaurante ainda não ativou o pagamento online.'});
  const items=JSON.parse(order.items).map(i=>({id:i.portionId,title:`${i.name} — ${i.portion}`,currency_id:'BRL',quantity:i.qty,unit_price:i.unitCents/100}));
  res.json({url:await createPreference(token,`order:${order.id}`,items,`/pedido.html?id=${order.id}`)});
}catch(e){next(e)}});
app.get('/api/manage/payments',requireUser,shopContext,(req,res)=>res.json({connected:Boolean(activeShop().mp_credentials),monthlyCents:Number(process.env.PLAN_MONTHLY_CENTS||0),lastBill:db.prepare('SELECT id,status,amount_cents,created_at FROM billing WHERE restaurant_id=? ORDER BY created_at DESC LIMIT 1').get(activeShop().id)||null}));
app.get('/api/manage/mp/connect',requireUser,shopContext,(req,res,next)=>{try{
  if(!process.env.MP_CLIENT_ID||!process.env.MP_CLIENT_SECRET||!baseUrl().startsWith('https://'))throw new Error('Configure credenciais e endereço HTTPS.');
  const state=crypto.randomBytes(24).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
  db.prepare('INSERT INTO oauth_states(state,restaurant_id,verifier,expires_at) VALUES(?,?,?,?)').run(state,activeShop().id,verifier,Date.now()+600000);
  const redirect=`${baseUrl()}/api/mp/callback`;
  const url=new URL('https://auth.mercadopago.com/authorization');
  for(const [key,value] of Object.entries({client_id:process.env.MP_CLIENT_ID,response_type:'code',platform_id:'mp',state,redirect_uri:redirect,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(key,value);
  res.json({url:url.href});
}catch(e){next(e)}});
app.get('/api/mp/callback',async(req,res,next)=>{try{
  const state=safeText(req.query.state,200),code=safeText(req.query.code,500);
  const row=db.prepare('SELECT * FROM oauth_states WHERE state=? AND expires_at>?').get(state,Date.now());
  if(!row||!code)return res.status(400).send('Autorização expirada.');
  db.prepare('DELETE FROM oauth_states WHERE state=?').run(state);
  const body=new URLSearchParams({grant_type:'authorization_code',client_id:process.env.MP_CLIENT_ID,client_secret:process.env.MP_CLIENT_SECRET,code,redirect_uri:`${baseUrl()}/api/mp/callback`,code_verifier:row.verifier});
  const response=await fetch('https://api.mercadopago.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(!response.ok||!data.access_token)throw new Error('Não foi possível vincular a conta.');
  db.prepare('UPDATE restaurants SET mp_credentials=? WHERE id=?').run(encrypt({accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:Date.now()+data.expires_in*1000,userId:data.user_id}),row.restaurant_id);
  res.redirect('/studio.html?pagamentos=conectado');
}catch(e){next(e)}});
app.post('/api/manage/billing/checkout',requireUser,shopContext,async(req,res,next)=>{try{
  const cents=Number(process.env.PLAN_MONTHLY_CENTS||0);
  if(!Number.isInteger(cents)||cents<100||!process.env.MP_OWNER_ACCESS_TOKEN)throw new Error('Plano ou conta de cobrança não configurados.');
  const id=uid();
  db.prepare('INSERT INTO billing(id,restaurant_id,amount_cents,status,created_at) VALUES(?,?,?,?,?)').run(id,activeShop().id,cents,'pending',new Date().toISOString());
  const url=await createPreference(process.env.MP_OWNER_ACCESS_TOKEN,`billing:${id}`,[{id:'mesa3d-monthly',title:'Mesa3D — mensalidade',currency_id:'BRL',quantity:1,unit_price:cents/100}],'/studio.html?pagamentos=retorno');
  res.json({url});
}catch(e){next(e)}});
app.post('/api/payments/webhook',async(req,res,next)=>{try{
  const secret=process.env.MP_WEBHOOK_SECRET;
  const sig=Object.fromEntries(String(req.get('x-signature')||'').split(',').map(x=>x.trim().split('=')));
  const requestId=req.get('x-request-id'),dataId=String(req.query['data.id']||'');
  const signedAt=String(sig.ts||'').length>=13?Number(sig.ts):Number(sig.ts)*1000;
  if(!secret||!sig.ts||!sig.v1||!requestId||!dataId||!/^\d+$/.test(sig.ts)||Math.abs(Date.now()-signedAt)>300000)return res.sendStatus(401);
  const expected=crypto.createHmac('sha256',secret).update(`id:${dataId};request-id:${requestId};ts:${sig.ts};`).digest('hex');
  if(!/^[0-9a-f]{64}$/i.test(sig.v1)||!crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(sig.v1,'hex')))return res.sendStatus(401);
  if(req.body?.type!=='payment')return res.sendStatus(200);
  const candidates=[{kind:'billing',token:process.env.MP_OWNER_ACCESS_TOKEN},...db.prepare('SELECT * FROM restaurants WHERE mp_credentials IS NOT NULL').all().map(s=>({kind:'order',shop:s}))];
  let handled=false;
  for(const candidate of candidates){
    try{
      const token=candidate.token||await merchantToken(candidate.shop);
      if(!token)continue;
      const payment=await mpJson(`/v1/payments/${encodeURIComponent(dataId)}`,token);
      const [kind,id]=String(payment.external_reference||'').split(':');
      const amount=Math.round(Number(payment.transaction_amount)*100);
      if(!Number.isSafeInteger(amount)||amount<=0)continue;
      if(kind==='billing'&&candidate.kind==='billing'){
        const bill=db.prepare('SELECT * FROM billing WHERE id=?').get(id);
        if(bill&&amount<=bill.amount_cents){
          db.prepare('INSERT INTO payment_events(payment_id,kind,reference_id,amount_cents,status) VALUES(?,?,?,?,?) ON CONFLICT(payment_id) DO UPDATE SET amount_cents=excluded.amount_cents,status=excluded.status').run(String(payment.id),'billing',id,amount,String(payment.status));
          const paid=db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS cents FROM payment_events WHERE kind='billing' AND reference_id=? AND status='approved'").get(id).cents;
          db.prepare('UPDATE billing SET status=?,payment_id=? WHERE id=?').run(paid>=bill.amount_cents?'paid':String(payment.status),String(payment.id),id);
          handled=true;
        }
      }
      if(kind==='order'&&candidate.kind==='order'){
        const order=db.prepare('SELECT * FROM orders WHERE id=? AND restaurant_id=?').get(id,candidate.shop.id);
        if(order&&amount<=order.total_cents){
          db.prepare('INSERT INTO payment_events(payment_id,kind,reference_id,amount_cents,status) VALUES(?,?,?,?,?) ON CONFLICT(payment_id) DO UPDATE SET amount_cents=excluded.amount_cents,status=excluded.status').run(String(payment.id),'order',id,amount,String(payment.status));
          const paid=db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS cents FROM payment_events WHERE kind='order' AND reference_id=? AND status='approved'").get(id).cents;
          db.prepare("UPDATE orders SET payment_status=?,payment_id=?,status=CASE WHEN ? AND status='awaiting_payment' THEN 'received' ELSE status END WHERE id=?").run(paid>=order.total_cents?'paid':String(payment.status),String(payment.id),paid>=order.total_cents?1:0,id);
          handled=true;
        }
      }
      if(handled)break;
    }catch{}
  }
  res.sendStatus(handled?200:503);
}catch(e){next(e)}});

app.use((err,req,res,next)=>{
  console.error(err);
  res.status(err instanceof multer.MulterError?413:400).json({error:err.message || 'Não foi possível concluir a operação.'});
});

await initStore();
if(!db.prepare("SELECT id FROM users WHERE role='owner' LIMIT 1").get()){
  const email=String(process.env.OWNER_EMAIL||'').toLowerCase();
  const password=process.env.OWNER_PASSWORD;
  if(email&&password)db.prepare('INSERT INTO users(id,email,password,role,restaurant_id,created_at) VALUES(?,?,?,?,?,?)')
    .run(uid(),email,hashPassword(password),'owner',null,new Date().toISOString());
  else console.warn('Administração desativada: configure OWNER_EMAIL e OWNER_PASSWORD no .env.');
}
const server=app.listen(port,host,()=>console.log(`Mesa3D Atelier em http://${host}:${server.address().port}`));
