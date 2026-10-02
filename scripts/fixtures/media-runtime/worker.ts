import {moderationMediaDispatch} from '../../../supabase/functions/_shared/moderation-media-dispatch.ts';
const id='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',lease='cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const original={id:'11111111-2222-4333-8444-555555555555',version:'fixture-v1',size:104857600,mime:'video/mp4'};
const archive={...original,id:'22222222-2222-4333-8444-555555555555',version:'archive-v1'};
Deno.serve(async()=>{
 let copied=false,deleted=false,proof=false,probe=false,bytesHashed=0;
 const job={id,lease_id:lease,revision:1,operation:'remove',source:{bucket:'post-media',path:'fixture/video.mp4'},
  evidence:{bucket:'moderation-evidence',path:`${id}/original`},original,archived:null};
 const upstream: typeof fetch=async(input,init)=>{
  const url=new URL(String(input)),path=url.pathname;
  if(url.hostname!=='fixture.invalid')throw Error('Offline fixture only');
  if(path.includes('/rest/v1/rpc/')){
   const name=path.split('/').at(-1);
   if(name==='claim_moderation_media_v1')return Response.json(job);
   if(name==='save_moderation_media_archive_v1')proof=true;
   if(name==='save_moderation_media_probe_v1')probe=true;
   return Response.json(true);
  }
  if(path.endsWith('/bucket/moderation-evidence'))return Response.json({id:'moderation-evidence',public:false});
  if(path.includes('/object/info/')){
   const evidence=path.includes('/moderation-evidence/');
   if(evidence?!copied:deleted)return Response.json({code:'NoSuchKey'},{status:404});
   const identity=evidence?archive:original;
   return Response.json({...identity,bucket_id:evidence?'moderation-evidence':'post-media',name:evidence?`${id}/original`:'fixture/video.mp4',content_type:identity.mime});
  }
  if(path.includes('/object/sign/'))return init?.method==='POST'
   ?Response.json({signedURL:'/object/sign/post-media/fixture/video.mp4?token=synthetic'})
   :new Response(new Uint8Array(1),{status:206});
  if(path.endsWith('/object/copy')){copied=true;return Response.json({});}
  if(init?.method==='DELETE'){
   if(!proof||!probe)throw Error('Durable proof required');deleted=true;return Response.json({});
  }
  if(path.includes('/object/authenticated/')){
   let remaining=original.size;
   return new Response(new ReadableStream({pull(controller){
    if(!remaining){controller.close();return;}
    const size=Math.min(65536,remaining);remaining-=size;bytesHashed+=size;controller.enqueue(new Uint8Array(size));
   }}));
  }
  throw Error('Unexpected fixture call');
 };
 const start=performance.now();
 const response=await moderationMediaDispatch(new Request('https://fixture.invalid/dispatch',{method:'POST',headers:{authorization:'Bearer synthetic'}}),
  {enabled:true,secret:'synthetic',supabaseUrl:'https://fixture.invalid',serviceKey:'sb_secret_synthetic'},upstream);
 return Response.json({result:await response.json(),bytesHashed,deleted,elapsedMs:performance.now()-start},{status:response.status});
});
