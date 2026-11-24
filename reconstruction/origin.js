export function publicOrigin(value,{allowLocal=false}={}){
 let url;try{url=new URL(value);}catch{throw new Error('INVALID_PUBLIC_ORIGIN');}
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('INVALID_PUBLIC_ORIGIN');
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.protocol!=='https:'&&!(allowLocal&&local&&url.protocol==='http:'))throw new Error('HTTPS_REQUIRED');
 if(local&&!allowLocal)throw new Error('PUBLIC_ORIGIN_REQUIRED');
 return url.origin;
}
