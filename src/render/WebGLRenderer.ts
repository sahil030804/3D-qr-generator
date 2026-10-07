import { computeCamera, type ViewState } from './camera';
import { SUN_DIR } from './light';
import { LIGHTING, type Lighting } from './lighting';
import { VERTEX_STRIDE, type Mesh } from './mesher';
import type { ViewRenderer } from './types';

const MESH_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec4 a_col;
layout(location = 2) in vec4 a_aux;
layout(location = 3) in vec4 a_alt;
uniform mat4 u_viewProj;
uniform float u_build;
uniform float u_resolve;
uniform vec3 u_sun;
uniform vec3 u_sky;
uniform vec3 u_gnd;
uniform vec3 u_sunCol;
uniform float u_exposure;
uniform float u_glow;
out vec3 v_albedo;
out vec3 v_light;
const vec3 NORMALS[6] = vec3[6](
  vec3(1.0, 0.0, 0.0), vec3(-1.0, 0.0, 0.0),
  vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0),
  vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0));
void main() {
  int ni = int(a_aux.x * 255.0 + 0.5);
  vec3 n = NORMALS[ni];
  int flags = int(a_aux.w * 255.0 + 0.5);
  bool ground = flags >= 128;
  bool emissive = (flags & 64) != 0;
  float span = a_aux.z;

  // Voxel center from this vertex: faces are emitted as four consecutive corners.
  int axis = ni / 2;
  float sgn = (ni % 2 == 0) ? 1.0 : -1.0;
  int corner = gl_VertexID & 3;
  float iu = (corner == 1 || corner == 2) ? 1.0 : 0.0;
  float iv = (corner >= 2) ? 1.0 : 0.0;
  vec3 off;
  if (axis == 0) off = vec3(-0.5 * sgn, 0.5 - iu, 0.5 - iv);
  else if (axis == 1) off = vec3(0.5 - iv, -0.5 * sgn, 0.5 - iu);
  else off = vec3(0.5 - iu, 0.5 - iv, -0.5 * sgn);
  vec3 center = a_pos + off;

  float scale = 1.0;
  vec3 shift = vec3(0.0);
  bool hidden = false;
  if (ground) {
    // Tiles grow outward from the middle.
    float t = clamp(u_build * 1.9 - span * 0.9, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - t, 3.0);
    scale = e;
    shift.y = -(1.0 - e) * 2.0;
    hidden = t <= 0.0;
  } else {
    // The object grows upward after the plot has formed.
    float t = clamp((u_build - span * 0.45 - 0.2) / 0.35, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - t, 3.0);
    scale = e;
    shift.y = -(1.0 - e) * 3.0;
    hidden = t <= 0.0;
  }
  vec3 pos = center + (a_pos - center) * scale + shift;
  gl_Position = hidden ? vec4(2.0, 2.0, 2.0, 1.0) : u_viewProj * vec4(pos, 1.0);

  float sky = n.y * 0.5 + 0.5;
  vec3 ambient = mix(u_gnd, u_sky, sky);
  float lambert = max(dot(n, u_sun), 0.0);
  float ao = a_col.a;
  vec3 sun = u_sunCol * lambert * (1.0 - a_aux.y * 0.82) * mix(0.55, 1.0, ao);
  vec3 light = (ambient * ao + sun) * u_exposure;
  if (emissive) light += vec3(u_glow);
  v_albedo = mix(a_col.rgb, a_alt.rgb, u_resolve);
  v_light = light;
}`;

const MESH_FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_albedo;
in vec3 v_light;
uniform float u_flat;
out vec4 outColor;
void main() {
  vec3 linear = pow(v_albedo, vec3(2.2)) * v_light;
  linear = linear / (1.0 + max(linear - 0.7, 0.0));
  vec3 lit = pow(clamp(linear, 0.0, 1.0), vec3(1.0 / 2.2));
  outColor = vec4(mix(lit, v_albedo, u_flat), 1.0);
}`;

const SHADOW_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;
uniform mat4 u_viewProj;
uniform vec3 u_center;
uniform float u_extent;
out vec2 v_corner;
void main() {
  v_corner = a_corner;
  gl_Position = u_viewProj * vec4(u_center.x + a_corner.x * u_extent, u_center.y, u_center.z + a_corner.y * u_extent, 1.0);
}`;

const SHADOW_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_corner;
uniform float u_strength;
out vec4 outColor;
void main() {
  vec2 p = abs(v_corner);
  float r = pow(pow(p.x, 4.0) + pow(p.y, 4.0), 0.25);
  float a = (1.0 - smoothstep(0.52, 1.0, r)) * u_strength;
  outColor = vec4(0.0, 0.0, 0.0, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create a shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create a program.');
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

function locations(gl: WebGL2RenderingContext, program: WebGLProgram, names: string[]): Uniforms {
  const out: Uniforms = {};
  for (const name of names) out[name] = gl.getUniformLocation(program, name);
  return out;
}

interface Resources {
  mesh: WebGLProgram;
  shadow: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vertexBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  shadowVao: WebGLVertexArrayObject;
  shadowBuffer: WebGLBuffer;
  uniforms: Uniforms;
  shadowUniforms: Uniforms;
}

/** Draws the whole voxel mesh with a single indexed draw call. Requires WebGL2. */
export class WebGLRenderer implements ViewRenderer {
  readonly kind = 'webgl' as const;
  private readonly gl: WebGL2RenderingContext;
  private resources: Resources | null = null;
  private mesh: Mesh | null = null;
  private lighting: Lighting = LIGHTING.night;
  private contextLost = false;
  private width = 1;
  private height = 1;

  private readonly onLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.resources = null;
  };
  private readonly onRestored = (): void => {
    this.contextLost = false;
    this.createResources();
    if (this.mesh) this.upload(this.mesh);
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'default' });
    if (!gl) throw new Error('WebGL2 is not available.');
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    this.createResources();
  }

  private createResources(): void {
    const gl = this.gl;
    const mesh = link(gl, MESH_VERTEX, MESH_FRAGMENT);
    const shadow = link(gl, SHADOW_VERTEX, SHADOW_FRAGMENT);
    const vao = gl.createVertexArray();
    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    const shadowVao = gl.createVertexArray();
    const shadowBuffer = gl.createBuffer();
    if (!vao || !vertexBuffer || !indexBuffer || !shadowVao || !shadowBuffer) throw new Error('Could not allocate GPU resources.');

    gl.bindVertexArray(shadowVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, shadowBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.resources = {
      mesh, shadow, vao, vertexBuffer, indexBuffer, shadowVao, shadowBuffer,
      uniforms: locations(gl, mesh, [
        'u_viewProj', 'u_build', 'u_resolve', 'u_sun', 'u_sky', 'u_gnd',
        'u_sunCol', 'u_exposure', 'u_glow', 'u_flat',
      ]),
      shadowUniforms: locations(gl, shadow, ['u_viewProj', 'u_center', 'u_extent', 'u_strength']),
    };
  }

  setMesh(mesh: Mesh): void {
    this.mesh = mesh;
    if (!this.contextLost && this.resources) this.upload(mesh);
  }

  setLighting(lighting: Lighting): void {
    this.lighting = lighting;
  }

  private upload(mesh: Mesh): void {
    const gl = this.gl;
    const r = this.resources;
    if (!r) return;
    gl.bindVertexArray(r.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, VERTEX_STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, VERTEX_STRIDE, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, VERTEX_STRIDE, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, VERTEX_STRIDE, 20);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, r.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    if (this.canvas.width !== this.width) this.canvas.width = this.width;
    if (this.canvas.height !== this.height) this.canvas.height = this.height;
  }

  render(view: ViewState): void {
    const r = this.resources;
    const mesh = this.mesh;
    if (this.contextLost || !r || !mesh) return;
    const gl = this.gl;
    const light = this.lighting;
    const camera = computeCamera(view, this.width / this.height, mesh.bounds);

    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Soft contact shadow under the plot.
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(r.shadow);
    gl.uniformMatrix4fv(r.shadowUniforms.u_viewProj, false, camera.viewProj);
    gl.uniform3f(r.shadowUniforms.u_center, mesh.bounds.size / 2, -0.4, mesh.bounds.size / 2);
    gl.uniform1f(r.shadowUniforms.u_extent, mesh.bounds.size * 0.78);
    gl.uniform1f(r.shadowUniforms.u_strength, light.shadow * (1 - view.flat) * Math.min(1, view.build * 2));
    gl.bindVertexArray(r.shadowVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(r.mesh);
    const u = r.uniforms;
    gl.uniformMatrix4fv(u.u_viewProj, false, camera.viewProj);
    gl.uniform1f(u.u_build, view.build);
    gl.uniform1f(u.u_resolve, view.resolve);
    gl.uniform3f(u.u_sun, SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]);
    gl.uniform3f(u.u_sky, light.sky[0], light.sky[1], light.sky[2]);
    gl.uniform3f(u.u_gnd, light.ground[0], light.ground[1], light.ground[2]);
    gl.uniform3f(u.u_sunCol, light.sun[0], light.sun[1], light.sun[2]);
    gl.uniform1f(u.u_exposure, light.exposure);
    gl.uniform1f(u.u_glow, light.glow);
    gl.uniform1f(u.u_flat, view.flat);
    gl.bindVertexArray(r.vao);
    gl.drawElements(gl.TRIANGLES, mesh.faceCount * 6, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    const r = this.resources;
    const gl = this.gl;
    if (r) {
      gl.deleteBuffer(r.vertexBuffer);
      gl.deleteBuffer(r.indexBuffer);
      gl.deleteBuffer(r.shadowBuffer);
      gl.deleteVertexArray(r.vao);
      gl.deleteVertexArray(r.shadowVao);
      gl.deleteProgram(r.mesh);
      gl.deleteProgram(r.shadow);
    }
    this.resources = null;
    this.mesh = null;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
