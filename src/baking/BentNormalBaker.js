import * as THREE from "three";
import {
	MeshBVH,
	MeshBVHUniformStruct,
	shaderStructs,
	shaderIntersectFunction,
} from "three-mesh-bvh";
import WebGLContext from "../core/WebGLContext";

const YIELD_BUDGET_MS = 10;

function sphereDirections(count) {
	const dirs = [];
	const golden = Math.PI * (3 - Math.sqrt(5));
	for (let i = 0; i < count; i++) {
		const y = 1 - ((i + 0.5) * 2) / count;
		const radius = Math.sqrt(1 - y * y);
		const theta = golden * i;
		dirs.push(
			new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius),
		);
	}
	return dirs;
}

const GBUFFER_VERTEX = `
	out vec3 vPos;
	out vec3 vNrm;
	out vec4 vTan;

	void main() {
		vPos = position;
		vNrm = normal;
		#ifdef USE_TANGENT
		vTan = tangent;
		#else
		vTan = vec4(0.0);
		#endif
		gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
	}
`;

const GBUFFER_FRAGMENT = `
	layout(location = 0) out vec4 gPosition;
	layout(location = 1) out vec4 gNormal;
	layout(location = 2) out vec4 gTangent;

	in vec3 vPos;
	in vec3 vNrm;
	in vec4 vTan;

	void main() {
		gPosition = vec4(vPos, 1.0);
		gNormal = vec4(vNrm, 0.0);
		gTangent = vTan;
	}
`;

const FULLSCREEN_VERTEX = `
	out vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = vec4(position.xy, 0.0, 1.0);
	}
`;

const RAY_FRAGMENT = `
	precision highp isampler2D;
	precision highp usampler2D;

	${shaderStructs}
	${shaderIntersectFunction}

	uniform BVH bvh;
	uniform sampler2D tPosition;
	uniform sampler2D tNormal;
	uniform sampler2D tTangent;
	uniform vec3 uDirections[SAMPLES];
	uniform float uOcclusionDist;
	uniform float uOffset;

	in vec2 vUv;
	layout(location = 0) out vec4 outBent;

	void main() {
		vec4 posSample = texture(tPosition, vUv);
		if (posSample.a < 0.5) {
			outBent = vec4(0.0);
			return;
		}

		vec3 p = posSample.xyz;
		vec3 n = normalize(texture(tNormal, vUv).xyz);
		vec4 tan4 = texture(tTangent, vUv);

		vec3 bent = vec3(0.0);
		float visible = 0.0;
		float weight = 0.0;

		uvec4 faceIndices;
		vec3 faceNormal;
		vec3 barycoord;
		float side;
		float dist;

		vec3 origin = p + n * uOffset;
		for (int i = 0; i < SAMPLES; i++) {
			vec3 dir = uDirections[i];
			float cosine = dot(n, dir);
			if (cosine <= 1e-4) continue;

			side = 1.0;
			dist = 0.0;
			bool hit = bvhIntersectFirstHit(
				bvh, origin, dir, faceIndices, faceNormal, barycoord, side, dist
			);
			if (!hit || dist > uOcclusionDist) {
				bent += dir * cosine;
				visible += cosine;
			}
			weight += cosine;
		}

		float ao = weight > 0.0 ? visible / weight : 1.0;
		if (dot(bent, bent) < 1e-8) bent = n;
		bent = normalize(bent);

		vec3 t = tan4.xyz;
		float tanSign = tan4.w != 0.0 ? tan4.w : 1.0;
		t -= n * dot(n, t);
		if (dot(t, t) < 1e-8) {
			t = vec3(1.0, 0.0, 0.0) - n * n.x;
			if (dot(t, t) < 1e-8) t = vec3(0.0, 1.0, 0.0) - n * n.y;
		}
		t = normalize(t);
		vec3 b = cross(n, t) * tanSign;

		outBent = vec4(
			vec3(dot(bent, t), dot(bent, b), dot(bent, n)) * 0.5 + 0.5,
			ao
		);
	}
`;

const DILATE_FRAGMENT = `
	uniform sampler2D tInput;
	uniform vec2 uTexel;
	varying vec2 vUv;

	void main() {
		vec4 center = texture2D(tInput, vUv);
		if (center.b > 0.25) {
			gl_FragColor = center;
			return;
		}
		for (int dy = -1; dy <= 1; dy++) {
			for (int dx = -1; dx <= 1; dx++) {
				if (dx == 0 && dy == 0) continue;
				vec4 s = texture2D(tInput, vUv + vec2(float(dx), float(dy)) * uTexel);
				if (s.b > 0.25) {
					gl_FragColor = s;
					return;
				}
			}
		}
		gl_FragColor = center;
	}
`;

export default class BentNormalBaker {
	constructor({ size = 512, samples = 96, dilationPasses = 6 } = {}) {
		this.size = size;
		this.samples = samples;
		this.dilationPasses = dilationPasses;
	}

	async bake(geometry) {
		const renderer = new WebGLContext().renderer;
		if (renderer) {
			try {
				return this.#bakeGpu(renderer, geometry);
			} catch (error) {
				console.warn(
					"[BentNormalBaker] GPU bake failed, falling back to CPU:",
					error,
				);
			}
		}
		return this.#bakeCpu(geometry);
	}

	#bakeGpu(renderer, geometry) {
		const start = performance.now();
		const size = this.size;

		const geo = geometry.clone();
		const bvh = new MeshBVH(geo);
		const bvhUniform = new MeshBVHUniformStruct();
		bvhUniform.updateFrom(bvh);

		if (!geo.boundingBox) geo.computeBoundingBox();
		const maxDist = geo.boundingBox.getSize(new THREE.Vector3()).length();

		const previousTarget = renderer.getRenderTarget();

		const gbufferRT = new THREE.WebGLRenderTarget(size, size, {
			count: 3,
			type: THREE.FloatType,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			depthBuffer: false,
		});
		const gbufferMaterial = new THREE.ShaderMaterial({
			glslVersion: THREE.GLSL3,
			vertexShader: GBUFFER_VERTEX,
			fragmentShader: GBUFFER_FRAGMENT,
			defines: geo.attributes.tangent ? { USE_TANGENT: "" } : {},
			side: THREE.DoubleSide,
			depthTest: false,
			depthWrite: false,
		});
		const gbufferScene = new THREE.Scene();
		const gbufferMesh = new THREE.Mesh(geo, gbufferMaterial);

		gbufferMesh.frustumCulled = false;
		gbufferScene.add(gbufferMesh);
		const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

		renderer.setRenderTarget(gbufferRT);
		renderer.render(gbufferScene, camera);

		const rayRT = new THREE.WebGLRenderTarget(size, size, {
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			depthBuffer: false,
		});
		const rayMaterial = new THREE.ShaderMaterial({
			glslVersion: THREE.GLSL3,
			defines: { SAMPLES: this.samples },
			vertexShader: FULLSCREEN_VERTEX,
			fragmentShader: RAY_FRAGMENT,
			uniforms: {
				bvh: { value: bvhUniform },
				tPosition: { value: gbufferRT.textures[0] },
				tNormal: { value: gbufferRT.textures[1] },
				tTangent: { value: gbufferRT.textures[2] },
				uDirections: { value: sphereDirections(this.samples) },

				uOcclusionDist: { value: maxDist * 0.5 },
				uOffset: { value: maxDist * 1e-4 },
			},
			depthTest: false,
			depthWrite: false,
		});
		const fsScene = new THREE.Scene();
		const fsMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), rayMaterial);
		fsMesh.frustumCulled = false;
		fsScene.add(fsMesh);

		renderer.setRenderTarget(rayRT);
		renderer.render(fsScene, camera);

		const makeDilateRT = (options = {}) =>
			new THREE.WebGLRenderTarget(size, size, {
				minFilter: THREE.NearestFilter,
				magFilter: THREE.NearestFilter,
				depthBuffer: false,
				...options,
			});
		const dilateA = makeDilateRT();
		const dilateB = makeDilateRT();
		const outputRT = makeDilateRT({
			minFilter: THREE.LinearMipmapLinearFilter,
			magFilter: THREE.LinearFilter,
			generateMipmaps: true,
		});

		const dilateMaterial = new THREE.ShaderMaterial({
			vertexShader: `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = vec4(position.xy, 0.0, 1.0);
				}
			`,
			fragmentShader: DILATE_FRAGMENT,
			uniforms: {
				tInput: { value: null },
				uTexel: { value: new THREE.Vector2(1 / size, 1 / size) },
			},
			depthTest: false,
			depthWrite: false,
		});
		fsMesh.material = dilateMaterial;

		const passes = Math.max(1, this.dilationPasses);
		let input = rayRT.texture;
		for (let i = 0; i < passes; i++) {
			const target =
				i === passes - 1 ? outputRT : i % 2 === 0 ? dilateA : dilateB;
			dilateMaterial.uniforms.tInput.value = input;
			renderer.setRenderTarget(target);
			renderer.render(fsScene, camera);
			input = target.texture;
		}

		renderer.setRenderTarget(previousTarget);

		gbufferRT.dispose();
		rayRT.dispose();
		dilateA.dispose();
		dilateB.dispose();
		gbufferMaterial.dispose();
		rayMaterial.dispose();
		dilateMaterial.dispose();
		fsMesh.geometry.dispose();
		bvhUniform.dispose();
		geo.dispose();

		const seconds = ((performance.now() - start) / 1000).toFixed(2);
		console.info(
			`[BentNormalBaker] GPU baked ${size}x${size} (${this.samples} rays/texel) in ${seconds}s`,
		);

		return { bentNormalMap: outputRT.texture };
	}

	async #bakeCpu(geometry) {
		const start = performance.now();

		const geo = geometry.clone();
		const bvh = new MeshBVH(geo);

		const texelCount = this.size * this.size;
		const positions = new Float32Array(texelCount * 3);
		const normals = new Float32Array(texelCount * 3);
		const tangents = new Float32Array(texelCount * 4);
		const mask = new Uint8Array(texelCount);
		this.#rasterizeUvSpace(geo, positions, normals, tangents, mask);

		const bentData = new Uint8Array(texelCount * 4);
		await this.#castRays(
			bvh,
			geo,
			positions,
			normals,
			tangents,
			mask,
			bentData,
		);

		this.#dilate(mask, [bentData]);

		const seconds = ((performance.now() - start) / 1000).toFixed(1);
		console.info(
			`[BentNormalBaker] CPU baked ${this.size}x${this.size} (${this.samples} rays/texel) in ${seconds}s`,
		);

		return { bentNormalMap: this.#createTexture(bentData) };
	}

	#rasterizeUvSpace(geo, positions, normals, tangents, mask) {
		const size = this.size;
		const pos = geo.attributes.position;
		const nrm = geo.attributes.normal;
		const tan = geo.attributes.tangent ?? null;
		const uv = geo.attributes.uv;
		const index = geo.index;
		const triCount = index.count / 3;

		for (let tri = 0; tri < triCount; tri++) {
			const i0 = index.getX(tri * 3);
			const i1 = index.getX(tri * 3 + 1);
			const i2 = index.getX(tri * 3 + 2);

			const u0 = uv.getX(i0) * size - 0.5;
			const v0 = uv.getY(i0) * size - 0.5;
			const u1 = uv.getX(i1) * size - 0.5;
			const v1 = uv.getY(i1) * size - 0.5;
			const u2 = uv.getX(i2) * size - 0.5;
			const v2 = uv.getY(i2) * size - 0.5;

			const denom = (v1 - v2) * (u0 - u2) + (u2 - u1) * (v0 - v2);
			if (Math.abs(denom) < 1e-10) continue;

			const minX = Math.max(0, Math.floor(Math.min(u0, u1, u2)));
			const maxX = Math.min(size - 1, Math.ceil(Math.max(u0, u1, u2)));
			const minY = Math.max(0, Math.floor(Math.min(v0, v1, v2)));
			const maxY = Math.min(size - 1, Math.ceil(Math.max(v0, v1, v2)));

			for (let y = minY; y <= maxY; y++) {
				for (let x = minX; x <= maxX; x++) {
					const i = y * size + x;
					if (mask[i]) continue;

					let w0 = ((v1 - v2) * (x - u2) + (u2 - u1) * (y - v2)) / denom;
					let w1 = ((v2 - v0) * (x - u2) + (u0 - u2) * (y - v2)) / denom;
					let w2 = 1 - w0 - w1;
					if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;

					w0 = Math.max(w0, 0);
					w1 = Math.max(w1, 0);
					w2 = Math.max(w2, 0);
					const sum = w0 + w1 + w2;
					w0 /= sum;
					w1 /= sum;
					w2 /= sum;

					for (let c = 0; c < 3; c++) {
						positions[i * 3 + c] =
							pos.getComponent(i0, c) * w0 +
							pos.getComponent(i1, c) * w1 +
							pos.getComponent(i2, c) * w2;
						normals[i * 3 + c] =
							nrm.getComponent(i0, c) * w0 +
							nrm.getComponent(i1, c) * w1 +
							nrm.getComponent(i2, c) * w2;
					}
					if (tan) {
						for (let c = 0; c < 3; c++) {
							tangents[i * 4 + c] =
								tan.getComponent(i0, c) * w0 +
								tan.getComponent(i1, c) * w1 +
								tan.getComponent(i2, c) * w2;
						}
						tangents[i * 4 + 3] = tan.getComponent(i0, 3);
					}
					mask[i] = 1;
				}
			}
		}
	}

	async #castRays(bvh, geo, positions, normals, tangents, mask, bentData) {
		const size = this.size;
		if (!geo.boundingBox) geo.computeBoundingBox();
		const maxDist = geo.boundingBox.getSize(new THREE.Vector3()).length();

		const occlusionDist = maxDist * 0.5;
		const offset = maxDist * 1e-4;
		const dirs = sphereDirections(this.samples);

		const ray = new THREE.Ray();
		const p = new THREE.Vector3();
		const n = new THREE.Vector3();
		const t = new THREE.Vector3();
		const b = new THREE.Vector3();
		const bent = new THREE.Vector3();

		let sliceStart = performance.now();

		for (let i = 0; i < size * size; i++) {
			if (!mask[i]) continue;

			if (performance.now() - sliceStart > YIELD_BUDGET_MS) {
				await new Promise((resolve) => setTimeout(resolve));
				sliceStart = performance.now();
			}

			p.fromArray(positions, i * 3);
			n.fromArray(normals, i * 3).normalize();
			bent.set(0, 0, 0);
			let visible = 0;
			let weight = 0;

			for (const dir of dirs) {
				const cosine = n.dot(dir);
				if (cosine <= 1e-4) continue;
				ray.origin.copy(p).addScaledVector(n, offset);
				ray.direction.copy(dir);
				const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, occlusionDist);
				if (!hit) {
					bent.addScaledVector(dir, cosine);
					visible += cosine;
				}
				weight += cosine;
			}

			const ao = weight > 0 ? visible / weight : 1;
			if (bent.lengthSq() < 1e-8) bent.copy(n);
			bent.normalize();

			t.fromArray(tangents, i * 4);
			const sign = tangents[i * 4 + 3] || 1;
			t.addScaledVector(n, -n.dot(t));
			if (t.lengthSq() < 1e-8) {
				t.set(1, 0, 0).addScaledVector(n, -n.x);
				if (t.lengthSq() < 1e-8) t.set(0, 1, 0).addScaledVector(n, -n.y);
			}
			t.normalize();
			b.crossVectors(n, t).multiplyScalar(sign);

			const o = i * 4;
			bentData[o] = Math.round((bent.dot(t) * 0.5 + 0.5) * 255);
			bentData[o + 1] = Math.round((bent.dot(b) * 0.5 + 0.5) * 255);
			bentData[o + 2] = Math.round((bent.dot(n) * 0.5 + 0.5) * 255);
			bentData[o + 3] = Math.round(ao * 255);
		}
	}

	#dilate(mask, buffers) {
		const size = this.size;
		let current = mask.slice();
		for (let pass = 0; pass < this.dilationPasses; pass++) {
			const next = current.slice();
			for (let y = 0; y < size; y++) {
				for (let x = 0; x < size; x++) {
					const i = y * size + x;
					if (current[i]) continue;

					let src = -1;
					for (let dy = -1; dy <= 1 && src < 0; dy++) {
						for (let dx = -1; dx <= 1; dx++) {
							if (!dx && !dy) continue;
							const nx = x + dx;
							const ny = y + dy;
							if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
							if (current[ny * size + nx]) {
								src = ny * size + nx;
								break;
							}
						}
					}
					if (src < 0) continue;

					for (const buf of buffers) {
						buf[i * 4] = buf[src * 4];
						buf[i * 4 + 1] = buf[src * 4 + 1];
						buf[i * 4 + 2] = buf[src * 4 + 2];
						buf[i * 4 + 3] = buf[src * 4 + 3];
					}
					next[i] = 1;
				}
			}
			current = next;
		}
	}

	#createTexture(data) {
		const texture = new THREE.DataTexture(
			data,
			this.size,
			this.size,
			THREE.RGBAFormat,
		);
		texture.minFilter = THREE.LinearMipmapLinearFilter;
		texture.magFilter = THREE.LinearFilter;
		texture.generateMipmaps = true;
		texture.needsUpdate = true;
		return texture;
	}
}
