// Bộ tô dáng NGỒI dành riêng cho ảnh RT. Không giữ ảnh tĩnh trên màn hình:
// tô màu theo đúng hàm grade của sprite.js, thêm line-boil, sao nhỏ trên tóc,
// tóc rung theo gió, vai thở, cánh tay và cẳng chân cử động nhỏ.
// Nguồn sprite ngồi vẫn là ảnh RGBA; tất cả hiệu ứng làm bằng WebGL cục bộ.

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uSize;
uniform float uTime;
uniform float uLying;
uniform float uSeed;
uniform float uBoil;
uniform float uHair;
uniform float uMane;
uniform float uHead;
uniform float uArmL;
uniform float uArmR;
uniform float uKickL;
uniform float uKickR;
uniform float uGlitch;
uniform float uGlitchSeed;
uniform float uSplit;
uniform float uDissolve;
uniform float uSparkle;
uniform float uGrade;
uniform vec4 uSil;
uniform vec2 uMisreg;
uniform vec3 uRim;
uniform float uAlpha;
uniform float uPx;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Giữ CÙNG thuật toán chỉnh đỏ/hồng/xanh với avatar RT đang đứng.
vec3 grade(vec3 c, out float red) {
  vec3 h = rgb2hsv(c);
  float hx = h.x < 0.5 ? h.x + 1.0 : h.x;
  float lit = smoothstep(0.1, 0.3, h.z);
  red = smoothstep(0.78, 0.85, hx) * (1.0 - smoothstep(1.06, 1.1, hx)) * lit * smoothstep(0.06, 0.2, h.y);
  float green = smoothstep(0.22, 0.27, h.x) * (1.0 - smoothstep(0.47, 0.52, h.x)) * lit * smoothstep(0.15, 0.3, h.y);
  hx = mix(hx, 0.968, red * 0.6 * uGrade);
  h.x = fract(hx);
  h.y = mix(h.y, max(h.y, 0.86), red * uGrade);
  h.y = mix(h.y, min(1.0, h.y * 1.1 + 0.06), green * uGrade);
  h.z = mix(h.z, min(1.0, h.z * 1.5 + 0.1), (red + green) * uGrade);
  return hsv2rgb(h);
}

// Mọi mốc tọa độ chia theo kích thước ảnh: không ảnh hưởng tỉ lệ cánh tay/chân.
vec2 deform(vec2 inputPx) {
  vec2 q = inputPx;
  vec2 n = q / uSize;
  float t = uTime;
  if (uLying > 0.5) {
    // Khóa vùng mặt/mặt nạ và thân: không còn giật cả hình khi chân đung đưa.
    // Chỉ phần tóc ở trên và cổ chân được dịch chuyển biên độ nhỏ theo thời gian.
    float face = 1.0 - smoothstep(0.16, 0.25, distance(n, vec2(0.29, 0.69)));
    float hair = (1.0 - smoothstep(0.34, 0.56, n.x))
      * (1.0 - smoothstep(0.38, 0.57, n.y)) * (1.0 - face);
    float tip = smoothstep(0.04, 0.14, n.x) * (1.0 - smoothstep(0.38, 0.56, n.x));
    q.y += hair * (2.9 * sin(t * 1.12 + n.x * 9.0) + clamp(uHair, -1.0, 1.0) * 2.0);
    q.x += hair * tip * 2.4 * sin(t * 1.33 + n.y * 7.0);

    // Nhịp thở cực nhẹ ở thân, không co bóp hoặc thu hẹp tỉ lệ người.
    float torso = smoothstep(0.46, 0.55, n.x) * (1.0 - smoothstep(0.66, 0.77, n.x));
    torso *= smoothstep(0.45, 0.56, n.y) * (1.0 - smoothstep(0.81, 0.93, n.y));
    q.y += torso * 1.35 * sin(t * 0.93 + 0.5);

    // Hai cẳng chân đưa qua lại tự nhiên. Tăng độ rõ khi thu nhỏ ảnh nằm:
    // mức dịch 18-26 px trên ảnh nguồn chỉ khoảng 3-5 px trên desktop.
    // Trọng số tăng từ đầu gối, giữ phần hông / mặt / thân cố định.
    float foot = smoothstep(0.72, 0.92, n.x);
    float upperFoot = foot * (1.0 - smoothstep(0.43, 0.62, n.y));
    float lowerFoot = foot * smoothstep(0.51, 0.74, n.y);
    float swingA = sin(t * 1.43 + 0.55);
    float swingB = sin(t * 1.18 + 2.15);
    q.y += upperFoot * (43.0 * swingA + clamp(uKickL, -1.0, 1.0) * 3.2); // SORA-ALL-FIX
    q.x += upperFoot * 9.0 * sin(t * 1.43 + 1.45);
    q.y += lowerFoot * (32.0 * swingB + clamp(uKickR, -1.0, 1.0) * 2.8);
    q.x += lowerFoot * 4.2 * sin(t * 1.18 + 0.6);
    // Chỉ cho line-boil rất nhỏ trên tóc/chân; mặt và thân giữ nguyên nét.
    float moveMask = max(hair, max(upperFoot, lowerFoot));
    q += moveMask * (vec2(vnoise(q * 0.075 + uSeed * 13.7),
      vnoise(q * 0.075 + uSeed * 7.3 + 31.0)) - 0.5) * min(uBoil, 0.45);
    return q;
  }
  // Hạ trọng số quanh mặt để mắt và đường viền không bị bóp méo.
  float face = 1.0 - smoothstep(0.11, 0.2, distance(n, vec2(0.53, 0.355)));
  float hair = (1.0 - smoothstep(0.34, 0.51, n.y)) * (1.0 - face);
  float hairTip = 0.45 + 0.55 * (1.0 - smoothstep(0.08, 0.45, n.y));
  q.x += hair * hairTip * (15.0 * sin(t * 1.7 + n.y * 14.0)
    + uHair * 24.0 + uMane * (n.x - 0.5) * 23.0);
  q.y += hair * 4.0 * sin(t * 2.3 + n.x * 19.0);
  // Nhân vật thở và nghiêng vai, nhưng hông vẫn dính chặt mép ngang.
  float torso = smoothstep(0.43, 0.56, n.y) * (1.0 - smoothstep(0.56, 0.63, n.y));
  q.x += torso * (4.0 * sin(t * 1.25) + uHead * 8.0);
  q.y += torso * 3.0 * sin(t * 1.25 + 0.4);
  // Hai cánh tay cử động quanh vị trí nghỉ; không rút ngắn tay.
  float armLeft = (1.0 - smoothstep(0.34, 0.47, n.x)) * smoothstep(0.42, 0.52, n.y)
    * (1.0 - smoothstep(0.59, 0.67, n.y));
  float armRight = smoothstep(0.65, 0.77, n.x) * smoothstep(0.41, 0.51, n.y)
    * (1.0 - smoothstep(0.59, 0.67, n.y));
  q.x += armLeft * (5.0 * sin(t * 1.2 + 1.2) - uArmL * 13.0);
  q.x += armRight * (6.0 * sin(t * 1.1 + 0.4) + uArmR * 13.0);
  // Cẳng chân đưa qua lại vài pixel, không thay đổi chiều dài.
  float calf = smoothstep(0.62, 0.72, n.y);
  float leftLeg = calf * (1.0 - smoothstep(0.43, 0.56, n.x));
  float rightLeg = calf * smoothstep(0.42, 0.55, n.x);
  q.x += leftLeg * (5.0 * sin(t * 0.84) + uKickL * 8.0);
  q.x += rightLeg * (4.0 * sin(t * 0.75 + 1.3) + uKickR * 8.0);
  // Độ rung đường nét nhỏ theo đúng nhịp vẽ tay RT, không lắc cả cơ thể.
  q += (vec2(vnoise(q * 0.075 + uSeed * 13.7), vnoise(q * 0.075 + uSeed * 7.3 + 31.0)) - 0.5)
    * 2.0 * uBoil;
  if (uGlitch > 0.0) {
    float band = floor(q.y / 19.0);
    q.x += step(0.90, hash(vec2(band, uSeed))) * uGlitch * 24.0;
  }
  return q;
}

void main() {
  vec2 q = deform(vUv * uSize);
  if (q.x < 0.0 || q.y < 0.0 || q.x >= uSize.x || q.y >= uSize.y) {
    gl_FragColor = vec4(0.0);
    return;
  }
  // Dùng cùng kiểu tan rã theo ô ảnh như sprite đứng khi có hiệu ứng dịch chuyển.
  if (uDissolve > 0.0) {
    vec2 cell = floor(q / (vec2(16.0, 9.0) * uSize.y / 420.0));
    if (hash(cell + floor(uGlitchSeed)) < uDissolve) discard;
  }
  vec4 c = texture2D(uTex, q / uSize);
  float red;
  vec3 rgb = grade(c.rgb, red);
  if (red > 0.0 && uSparkle > 0.0) {
    vec2 cell = floor(q / max(0.8, uPx * 1.2));
    float star = step(0.976, hash(cell + 3.1)) * 0.85;
    float tw = step(0.993, hash(cell + uSeed * 1.37));
    rgb = mix(rgb, vec3(1.0, 0.95, 0.97), clamp((star + tw) * red * uSparkle, 0.0, 1.0));
  }
  // Mắt xanh nhấp nháy nhẹ, không che toàn bộ khuôn mặt.
  float eye = smoothstep(0.13, 0.32, c.g - max(c.r, c.b));
  float blinkPhase = mod(uTime, 7.6);
  float blink = 1.0 - smoothstep(0.0, 0.09, abs(blinkPhase - 0.06));
  vec2 n = q / uSize;
  vec2 eyeCenter = uLying > 0.5 ? vec2(0.27, 0.65) : vec2(0.55, 0.338);
  float eyeRegion = 1.0 - smoothstep(0.055, 0.11, distance(n, eyeCenter));
  rgb = mix(rgb, rgb * 0.35, blink * eye * eyeRegion * 0.7);
  // Cùng viền tím in lệch như shader đứng; offset theo đúng tỉ lệ ảnh ngồi.
  float rim = texture2D(uTex, clamp((q - uMisreg) / uSize, vec2(0.0), vec2(1.0))).a;
  vec3 col = rgb * c.a;
  float alpha = c.a;
  if (uSplit > 0.0) {
    float delta = uSplit * uSize.y / 420.0;
    vec4 cr = texture2D(uTex, clamp((q + vec2(delta, 0.0)) / uSize, vec2(0.0), vec2(1.0)));
    vec4 cb = texture2D(uTex, clamp((q - vec2(delta, delta * 0.3)) / uSize, vec2(0.0), vec2(1.0)));
    float rr, br;
    col.r = grade(cr.rgb, rr).r * cr.a;
    col.b = grade(cb.rgb, br).b * cb.a;
    alpha = max(alpha, max(cr.a, cb.a));
  }
  col = mix(col, uSil.rgb * alpha, clamp(uSil.a, 0.0, 1.0));
  rim *= (1.0 - alpha);
  gl_FragColor = vec4(col + uRim * rim, min(1.0, alpha + rim)) * uAlpha;
}`;

const UNIFORMS = [
  'uTex', 'uSize', 'uTime', 'uLying', 'uSeed', 'uBoil', 'uHair', 'uMane', 'uHead',
  'uArmL', 'uArmR', 'uKickL', 'uKickR', 'uGlitch', 'uGlitchSeed', 'uSplit',
  'uDissolve', 'uSparkle', 'uGrade', 'uSil',
  'uMisreg', 'uRim', 'uAlpha', 'uPx',
];

export class SeatedRenderer {
  constructor(canvas, image, { lying = false } = {}) {
    this.canvas = canvas;
    this.image = image;
    this.lying = Boolean(lying);
    this.scale = 0.6;
    this.gl = null;
    this.u = {};
    this.setup();
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.gl = null;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try { this.setup(); this.resize(this.scale); }
      catch (error) { console.warn('[Sora] Không khôi phục được shader ngồi', error); }
    });
  }

  setup() {
    const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) throw new Error('Không có WebGL cho sprite ngồi');
    const program = gl.createProgram();
    for (const [kind, source] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
      const shader = gl.createShader(kind);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || 'Shader ngồi không biên dịch được');
      }
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) || 'Shader ngồi không liên kết được');
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.texture=texture; // SORA-SIT-THREE-MODES-V3
    this.gl = gl;
    this.program = program;
    this.u = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]));
    gl.uniform1i(this.u.uTex, 0);
    gl.uniform2f(this.u.uSize, this.image.width, this.image.height);
    gl.clearColor(0, 0, 0, 0);
  }

  // Same WebGL texture/grade/glitch/rim used by the original seated Sora.
  // Update only the frame pixels of the 60-frame source (no second shader).
  refreshTexture(source) {
    if (!this.gl || !this.texture || !source) return false;
    const gl=this.gl;
    gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,source);
    return true;
  }

  resize(scale, cssWidth = 180, cssHeight = 250) {
    this.scale = scale;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    if (!this.gl) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const pxWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pxHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== pxWidth || this.canvas.height !== pxHeight) {
      this.canvas.width = pxWidth;
      this.canvas.height = pxHeight;
    }
    this.gl.viewport(0, 0, pxWidth, pxHeight);
    this.gl.useProgram(this.program);
    this.gl.uniform1f(this.u.uPx, this.image.width / pxWidth);
  }

  draw(p, now = performance.now()) {
    const gl = this.gl;
    if (!gl) return false;
    gl.useProgram(this.program);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const u = this.u;
    gl.uniform1f(u.uTime, now * 0.001);
    gl.uniform1f(u.uLying, this.lying ? 1 : 0);
    gl.uniform1f(u.uSeed, p.seed || 0);
    gl.uniform1f(u.uBoil, p.boil ?? 0.9);
    gl.uniform1f(u.uHair, p.hair || 0);
    gl.uniform1f(u.uMane, p.mane || 0);
    gl.uniform1f(u.uHead, p.head || 0);
    gl.uniform1f(u.uArmL, p.armL || 0);
    gl.uniform1f(u.uArmR, p.armR || 0);
    gl.uniform1f(u.uKickL, p.kickL || 0);
    gl.uniform1f(u.uKickR, p.kickR || 0);
    gl.uniform1f(u.uGlitch, p.glitch || 0);
    gl.uniform1f(u.uGlitchSeed, p.glitchSeed || 0);
    gl.uniform1f(u.uSplit, p.split || 0);
    gl.uniform1f(u.uDissolve, p.dissolve || 0);
    gl.uniform1f(u.uSparkle, p.sparkle ?? 1);
    gl.uniform1f(u.uGrade, p.grade ?? 1);
    gl.uniform4f(u.uSil, p.sil?.[0] ?? 0.08, p.sil?.[1] ?? 0.06,
      p.sil?.[2] ?? 0.11, p.silAmount ?? 0);
    // Sprite đứng rộng 240px, ảnh ngồi 948px: quy đổi độ lệch viền tím.
    const rimScale = this.image.height / 420;
    gl.uniform2f(u.uMisreg, (p.misreg?.[0] ?? -2.6) * rimScale,
      (p.misreg?.[1] ?? 2.2) * rimScale);
    gl.uniform3f(u.uRim, 0.48, 0.24, 1.0);
    gl.uniform1f(u.uAlpha, p.alpha ?? 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }
}
