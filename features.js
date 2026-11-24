export const getFeatures = () => ({local3d:false,meshyConfigured:false});
export function reconstructionDisabled(req,res) {
  res.status(503).json({code:'RECONSTRUCTION_DISABLED',error:'Geração 3D indisponível. Envie um GLB pronto e revise as medidas antes de publicar.'});
}
