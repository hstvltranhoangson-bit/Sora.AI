// SORA SIT-V3: the two 60-frame sequences share the SAME SeatedRenderer
// grade/glitch/rim/sparkle shader and the same Sora position/physics.
// sitClassic remains the original #seat-effects WebGL renderer.
import { SeatedRenderer } from './seated-renderer.js';
import { PERCH_ART } from './sora-sit-mode.mjs';

export const PERCH_FRAME = Object.freeze({width:196, height:384, count:60, fps:12});
export function frameAt(ms, fps=PERCH_FRAME.fps) {
  return Math.floor(Math.max(0, ms) * fps / 1000) % PERCH_FRAME.count;
}

export class SoraPerch60 {
  constructor(canvas) {
    this.canvas=canvas;
    this.ready=false;
    this.enabled=true;
    this.miniWindowId=null;
    this.musicPlaying=false;
    this.visible=false;
    this.currentMode='sitClassic';
    this.currentBox=null;
    this.lastFrame=-1;
    this.lastType='';
    this.lastSize=null;
    this.shader=null;
    this.frameCanvas=null;
    this.frameCtx=null;
    this.idle=null;
    this.music=null;
    if (!canvas || typeof Image !== 'function' || typeof document === 'undefined') return;
    this.frameCanvas=document.createElement('canvas');
    this.frameCanvas.width=PERCH_FRAME.width;
    this.frameCanvas.height=PERCH_FRAME.height;
    this.frameCtx=this.frameCanvas.getContext('2d',{willReadFrequently:true});
    if (!this.frameCtx) return;
    const load=(name)=>{
      const img=new Image();
      img.onload=()=>{
        if (img.naturalWidth!==PERCH_FRAME.width*PERCH_FRAME.count || img.naturalHeight!==PERCH_FRAME.height) {
          console.warn('[Sora] Sprite ngồi 60 khung sai kích thước:',name); return;
        }
        this.ready=Boolean(this.idle?.naturalWidth===PERCH_FRAME.width*PERCH_FRAME.count);
      };
      img.onerror=()=>console.warn('[Sora] Thiếu sprite ngồi:',name);
      img.src=new URL(`../../../assets/sora/${name}`,import.meta.url).href;
      return img;
    };
    this.idle=load('sora-perch-60.png');
    this.music=load('sora-perch-music-60.png');
    this.hide();
    void this.pullMedia();
    this.timer=setInterval(()=>void this.pullMedia(),2200);
  }

  async pullMedia() {
    try {
      const data=await window.host?.fusionMusic?.();
      this.musicPlaying=Boolean(data?.playing);
      this.miniWindowId=data?.miniWindowId ?? null;
      if (typeof data?.perchEnabled==='boolean') this.enabled=data.perchEnabled;
    } catch (_) { this.musicPlaying=false; this.miniWindowId=null; }
  }

  hide() {
    this.visible=false;
    this.currentMode='sitClassic';
    this.currentBox=null;
    if(this.canvas) this.canvas.style.opacity='0';
  }

  setupShader() {
    if (this.shader || !this.canvas || !this.frameCanvas) return;
    try {
      this.shader=new SeatedRenderer(this.canvas,this.frameCanvas);
    } catch (err) {
      // Low-end GPU: only then use the same classic CSS fallback grade.
      console.warn('[Sora] WebGL perch không sẵn sàng:',err);
      this.shader=null;
      this.ctx=this.canvas.getContext('2d',{alpha:true});
      this.canvas.width=PERCH_FRAME.width;
      this.canvas.height=PERCH_FRAME.height;
      this.canvas.classList.add('is-fallback');
    }
  }

  sync({mode,box,rootLeft,rootTop,facing=1,tilt=0,params,opacity=1,scale=0.6,now=performance.now()}) {
    if (!this.ready || !this.enabled || mode==='sitClassic' || !box || !this.frameCtx) {
      this.hide(); return false;
    }
    const music=mode==='perchMusic';
    const frame=frameAt(now);
    const src=music && this.music?.naturalWidth ? this.music : this.idle;
    if (!src?.naturalWidth) {this.hide();return false;}
    const kind=src===this.music?'music':'idle';
    if(frame!==this.lastFrame || kind!==this.lastType) {
      this.frameCtx.clearRect(0,0,PERCH_FRAME.width,PERCH_FRAME.height);
      this.frameCtx.drawImage(src,frame*PERCH_FRAME.width,0,PERCH_FRAME.width,PERCH_FRAME.height,
        0,0,PERCH_FRAME.width,PERCH_FRAME.height);
      this.lastFrame=frame; this.lastType=kind;
    }
    this.setupShader();
    this.canvas.style.left=`${box.x-rootLeft}px`;
    this.canvas.style.top=`${box.y-rootTop}px`;
    this.canvas.style.width=`${box.width}px`;
    this.canvas.style.height=`${box.height}px`;
    this.canvas.style.transformOrigin=`${box.pivotX*100}% ${box.pivotY*100}%`;
    this.canvas.style.transform=`scaleX(${facing}) rotate(${(tilt*0.22).toFixed(2)}deg)`;
    this.currentBox=box;
    this.currentMode=mode;
    this.visible=true;
    if (this.shader?.gl) {
      if (!this.lastSize || this.lastSize.width!==box.width || this.lastSize.height!==box.height) {
        this.shader.resize(scale,box.width,box.height);
        this.lastSize={width:box.width,height:box.height};
      }
      this.shader.refreshTexture(this.frameCanvas);
      this.shader.draw(params,now);
      this.canvas.style.opacity=String(Math.max(0,Math.min(1,opacity)));
    } else if(this.ctx) {
      this.ctx.clearRect(0,0,PERCH_FRAME.width,PERCH_FRAME.height);
      this.ctx.drawImage(this.frameCanvas,0,0);
      this.canvas.style.opacity=String(Math.max(0,Math.min(1,opacity*(params?.alpha??1))));
    } else {this.hide();return false;}
    return true;
  }

  hit(screenX,screenY,facing=1) {
    const b=this.currentBox;
    if (!this.visible || !b || !this.frameCtx) return false;
    let nx=(screenX-b.x)/b.width;
    let ny=(screenY-b.y)/b.height;
    if (facing===-1) nx=2*PERCH_ART.hipX-nx;
    if (nx<0 || ny<0 || nx>=1 || ny>=1) return false;
    const a=this.frameCtx.getImageData(Math.floor(nx*PERCH_FRAME.width),
      Math.floor(ny*PERCH_FRAME.height),1,1).data[3];
    return a>35;
  }
}
