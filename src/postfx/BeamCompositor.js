import * as THREE from "three";
import VolumetricBeam from "../objects/VolumetricBeam";
import BeamParticles from "../objects/BeamParticles";
import FULLSCREEN_VERTEX from "../shaders/fullscreen.vert.glsl";
import DOWNSAMPLE_FRAGMENT from "../shaders/bloomDownsample.frag.glsl";
import UPSAMPLE_FRAGMENT from "../shaders/bloomUpsample.frag.glsl";
import SCREEN_FRAGMENT from "../shaders/screen.frag.glsl";

const RESOLUTION_SCALE = 0.25;

const BLOOM_MIP_COUNT = 6;

export default class BeamCompositor {
	constructor(spotLight, bounds, { width, height, pixelRatio }) {
		this.width = width;
		this.height = height;
		this.pixelRatio = pixelRatio;

		this.threshold = 0.075;
		this.knee = 0.0;
		this.radius = 1;
		this.bloomStrength = 2.5;
		this.grainStrength = 0.04;

		this.beam = new VolumetricBeam(spotLight, bounds);
		this.beamScene = new THREE.Scene();
		this.beamScene.add(this.beam.mesh);

		this.particles = new BeamParticles(this.beam, 15, {
			size: 4,
			speed: 0.2,
			intensity: 0.1,
			focusDistance: 16.0,
			focusRange: 0.5,
		});
		this.beamScene.add(this.particles.points);

		this.particlesFine = new BeamParticles(this.beam, 50, {
			size: 1,
			speed: 0.1,
			intensity: 1,
			focusRange: 16.0,
		});

		this.particlesMedium = new BeamParticles(this.beam, 15, {
			size: 2.5,
			speed: 0.15,
			intensity: 0.2,
			focusRange: 0.5,
		});

		this.occluderScene = new THREE.Scene();
		this.occluders = [];

		this.depthRT = new THREE.WebGLRenderTarget(
			this.#targetWidth(),
			this.#targetHeight(),
		);
		this.depthRT.depthTexture = new THREE.DepthTexture(
			this.#targetWidth(),
			this.#targetHeight(),
		);

		this.beamRT = new THREE.WebGLRenderTarget(
			this.#targetWidth(),
			this.#targetHeight(),
			{ type: THREE.HalfFloatType, depthBuffer: false },
		);

		this.sceneRT = new THREE.WebGLRenderTarget(
			this.#fullWidth(),
			this.#fullHeight(),
			{ type: THREE.HalfFloatType, samples: 2 },
		);

		this.bloomMips = [];
		for (let i = 0; i < BLOOM_MIP_COUNT; i++) {
			this.bloomMips.push(
				new THREE.WebGLRenderTarget(
					Math.max(1, this.#targetWidth() >> i),
					Math.max(1, this.#targetHeight() >> i),
					{ type: THREE.HalfFloatType, depthBuffer: false },
				),
			);
		}

		this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
		this.#createBloomMaterials();

		this.cameraForward = new THREE.Vector3();
	}

	addOccluder(object) {
		object.updateWorldMatrix(true, true);
		object.traverse((child) => {
			if (!child.isMesh) return;
			const proxy = new THREE.Mesh(
				child.geometry,
				new THREE.MeshBasicMaterial({ color: 0x000000 }),
			);
			proxy.matrixAutoUpdate = false;
			proxy.matrix.copy(child.matrixWorld);
			this.occluderScene.add(proxy);
			this.occluders.push({ source: child, proxy });
		});
	}

	captureProbe(renderer, scene, cubeCamera, hide = []) {
		const uniforms = this.beam.material.uniforms;
		const depthWasReady = uniforms.uDepthReady.value;
		uniforms.uDepthReady.value = false;

		hide.forEach((mesh) => (mesh.visible = false));
		scene.add(this.beam.mesh);
		cubeCamera.update(renderer, scene);
		this.beamScene.add(this.beam.mesh);
		hide.forEach((mesh) => (mesh.visible = true));

		uniforms.uDepthReady.value = depthWasReady;
	}

	update(elapsed) {
		this.beam.update(elapsed);
		this.screenMaterial.uniforms.uTime.value = elapsed;

		for (const { source, proxy } of this.occluders) {
			source.updateWorldMatrix(true, false);
			proxy.matrix.copy(source.matrixWorld);
		}
	}

	render(renderer, scene, camera) {
		const uniforms = this.beam.material.uniforms;
		uniforms.uSceneDepth.value = this.depthRT.depthTexture;
		uniforms.uDepthReady.value = true;
		uniforms.uCameraNear.value = camera.near;
		uniforms.uCameraFar.value = camera.far;
		uniforms.uCameraForward.value.copy(
			camera.getWorldDirection(this.cameraForward),
		);
		uniforms.uResolution.value.set(this.#targetWidth(), this.#targetHeight());

		renderer.setRenderTarget(this.depthRT);
		renderer.render(this.occluderScene, camera);

		renderer.setRenderTarget(this.beamRT);
		renderer.render(this.beamScene, camera);

		const toneMapping = renderer.toneMapping;
		renderer.toneMapping = THREE.NoToneMapping;
		renderer.setRenderTarget(this.sceneRT);
		renderer.render(scene, camera);
		renderer.toneMapping = toneMapping;

		this.fsMesh.material = this.bloomPrefilterMaterial;
		renderer.setRenderTarget(this.bloomMips[0]);
		renderer.render(this.fsScene, this.postCamera);

		this.fsMesh.material = this.bloomDownsampleMaterial;
		for (let i = 1; i < this.bloomMips.length; i++) {
			const prev = this.bloomMips[i - 1];
			this.bloomDownsampleMaterial.uniforms.tInput.value = prev.texture;
			this.bloomDownsampleMaterial.uniforms.uTexel.value.set(
				1 / prev.width,
				1 / prev.height,
			);
			renderer.setRenderTarget(this.bloomMips[i]);
			renderer.render(this.fsScene, this.postCamera);
		}

		this.fsMesh.material = this.bloomUpsampleMaterial;
		renderer.autoClear = false;
		for (let i = this.bloomMips.length - 2; i >= 0; i--) {
			const lower = this.bloomMips[i + 1];
			this.bloomUpsampleMaterial.uniforms.tInput.value = lower.texture;
			this.bloomUpsampleMaterial.uniforms.uTexel.value.set(
				1 / lower.width,
				1 / lower.height,
			);
			renderer.setRenderTarget(this.bloomMips[i]);
			renderer.render(this.fsScene, this.postCamera);
		}
		renderer.autoClear = true;

		renderer.setRenderTarget(null);
		this.fsMesh.material = this.screenMaterial;
		renderer.render(this.fsScene, this.postCamera);
	}

	setSize(width, height, pixelRatio) {
		this.width = width;
		this.height = height;
		this.pixelRatio = pixelRatio;

		const w = this.#targetWidth();
		const h = this.#targetHeight();
		this.beamRT.setSize(w, h);
		this.depthRT.setSize(w, h);

		this.depthRT.depthTexture.image.width = w;
		this.depthRT.depthTexture.image.height = h;
		this.depthRT.depthTexture.needsUpdate = true;
		this.screenMaterial.uniforms.uBeamTexel.value.set(1 / w, 1 / h);

		this.sceneRT.setSize(this.#fullWidth(), this.#fullHeight());
		for (let i = 0; i < this.bloomMips.length; i++) {
			this.bloomMips[i].setSize(Math.max(1, w >> i), Math.max(1, h >> i));
		}
		this.bloomPrefilterMaterial.uniforms.uTexel.value.set(
			1 / this.#fullWidth(),
			1 / this.#fullHeight(),
		);
	}

	#createBloomMaterials() {
		this.fsScene = new THREE.Scene();
		this.fsMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
		this.fsScene.add(this.fsMesh);

		this.bloomPrefilterMaterial = new THREE.ShaderMaterial({
			defines: { PREFILTER: "" },
			uniforms: {
				tInput: { value: this.sceneRT.texture },
				uTexel: {
					value: new THREE.Vector2(
						1 / this.#fullWidth(),
						1 / this.#fullHeight(),
					),
				},
				uThreshold: { value: this.threshold },
				uKnee: { value: this.knee },
			},
			vertexShader: FULLSCREEN_VERTEX,
			fragmentShader: DOWNSAMPLE_FRAGMENT,
			depthTest: false,
			depthWrite: false,
		});

		this.bloomDownsampleMaterial = new THREE.ShaderMaterial({
			uniforms: {
				tInput: { value: null },
				uTexel: { value: new THREE.Vector2() },
			},
			vertexShader: FULLSCREEN_VERTEX,
			fragmentShader: DOWNSAMPLE_FRAGMENT,
			depthTest: false,
			depthWrite: false,
		});

		this.bloomUpsampleMaterial = new THREE.ShaderMaterial({
			uniforms: {
				tInput: { value: null },
				uTexel: { value: new THREE.Vector2() },
				uRadius: { value: this.radius },
			},
			vertexShader: FULLSCREEN_VERTEX,
			fragmentShader: UPSAMPLE_FRAGMENT,
			blending: THREE.CustomBlending,
			blendEquation: THREE.AddEquation,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneFactor,
			transparent: true,
			depthTest: false,
			depthWrite: false,
		});

		this.screenMaterial = new THREE.ShaderMaterial({
			uniforms: {
				tScene: { value: this.sceneRT.texture },
				tBloom: { value: this.bloomMips[0].texture },
				tBeam: { value: this.beamRT.texture },
				uBeamTexel: {
					value: new THREE.Vector2(
						1 / this.#targetWidth(),
						1 / this.#targetHeight(),
					),
				},
				uBloomStrength: { value: this.bloomStrength },
				uGrainStrength: { value: this.grainStrength },
				uTime: { value: 0 },
			},
			vertexShader: FULLSCREEN_VERTEX,
			fragmentShader: SCREEN_FRAGMENT,
			blending: THREE.NoBlending,
			depthTest: false,
			depthWrite: false,
		});
	}

	#fullWidth() {
		return Math.max(1, Math.floor(this.width * this.pixelRatio));
	}

	#fullHeight() {
		return Math.max(1, Math.floor(this.height * this.pixelRatio));
	}

	#targetWidth() {
		return Math.max(
			1,
			Math.floor(this.width * this.pixelRatio * RESOLUTION_SCALE),
		);
	}

	#targetHeight() {
		return Math.max(
			1,
			Math.floor(this.height * this.pixelRatio * RESOLUTION_SCALE),
		);
	}
}
