import * as THREE from "three";
import WebGLContext from "../core/WebGLContext";
import BeamCompositor from "../postfx/BeamCompositor";
import BackgroundPlane from "../objects/BackgroundPlane";
import FloatingObjects from "../objects/FloatingObjects";
import LightGradient from "../objects/LightGradient";
import Arm from "../objects/Arm";
import { LightProbeGenerator } from "three/addons/lights/LightProbeGenerator.js";
import { CameraRig } from "../utils/CameraRig";

export default class Scene {
	constructor() {
		this.context = null;
		this.camera = null;
		this.width = 0;
		this.height = 0;
		this.aspectRatio = 0;
		this.scene = null;
		this.frame = 0;
		this.probeUpdating = false;
		this.probeIntensity = 3;
		this.#init();
	}

	async #init() {
		this.#setContext();
		this.#setupScene();
		this.#setupCamera();

		this.#addLights();
		await this.#addObjects();
		this.#setupCompositor();
		this.#setupLightGradient();
		this.#setupLightProbe();
		// this.#setupArmShading(); // Removed bent normals due to crashing
		this.#primeGI();
	}

	#primeGI() {
		const renderer = this.context.renderer;
		this.compositor.update(0);
		this.compositor.render(renderer, this.scene, this.camera);
		this.compositor.update(0);
		this.#updateLightProbe();
	}

	#setContext() {
		this.context = new WebGLContext();
	}

	#setupScene() {
		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x010204);
	}

	#setupCamera() {
		this.#calculateAspectRatio();
		this.camera = new THREE.PerspectiveCamera(45, this.aspectRatio, 0.1, 100);
		this.camera.position.set(0, 0, 8);

		this.rig = new CameraRig(this.camera, {
			target: new THREE.Vector3(-0.5, 0, -1),
			xLimit: [-1.5, 1.5],
			yLimit: [-1, 1],
			zLimit: [8, 6],
			smoothTime: 0.4,
		});
		this.rig.distanceScale = this.#responsiveDistanceScale();
	}

	#responsiveDistanceScale() {
		return THREE.MathUtils.clamp(1.7 / this.aspectRatio, 1, 1.5);
	}

	#addLights() {
		this.spotLight = new THREE.SpotLight(0xfff2dd, 600);
		this.spotLight.position.set(-10, -3.5, -1);
		this.spotLight.target.position.set(9, 2.5, -1);
		this.spotLight.angle = 0.225;
		this.spotLight.penumbra = 0.35;
		this.spotLight.decay = 2.6;
		this.spotLight.distance = 40;

		this.spotLight.castShadow = true;
		this.spotLight.shadow.mapSize.set(1024, 1024);
		this.spotLight.shadow.camera.near = 1;
		this.spotLight.shadow.camera.far = 40;
		this.spotLight.shadow.bias = -0.002;

		this.scene.add(this.spotLight);
		this.scene.add(this.spotLight.target);
	}

	async #addObjects() {
		this.model = await Arm.load(`${import.meta.env.BASE_URL}arm_bones.glb`);
		this.model.position.set(2, -1.75, 1.5);

		this.model.rotation.x = 1.5;
		this.model.rotation.y = 3.14;
		this.model.rotation.z = -2.6;
		this.model.scale.setScalar(3.5);
		this.scene.add(this.model);

		this.backgroundPlane = new BackgroundPlane();
		this.backgroundPlane.update(this.camera);
		this.scene.add(this.backgroundPlane.mesh);

		this.floatingObjects = new FloatingObjects();
		this.floatingObjects.setBasePosition(-0.5, 0.75, -1);
		this.floatingObjects.setCellScale(this.rig.distanceScale);
		this.scene.add(this.floatingObjects);
	}

	#setupCompositor() {
		const bounds = new THREE.Box3(
			new THREE.Vector3(-8, -6, -4.5),
			new THREE.Vector3(8, 6, 2),
		);

		this.compositor = new BeamCompositor(this.spotLight, bounds, {
			width: this.width,
			height: this.height,
			pixelRatio: this.context.pixelRatio,
		});

		this.compositor.addOccluder(this.model);
		this.compositor.addOccluder(this.backgroundPlane.mesh);

		this.scene.add(this.compositor.particlesFine.points);
		this.scene.add(this.compositor.particlesMedium.points);
	}

	#setupLightGradient() {
		this.lightGradient = new LightGradient(
			this.spotLight,
			this.compositor.beam.material.uniforms,
			{ blueSpread: 3 },
		);
	}

	#setupLightProbe() {
		this.lightProbe = new THREE.LightProbe();
		this.scene.add(this.lightProbe);

		this.probeRenderTarget = new THREE.WebGLCubeRenderTarget(64);
		this.probeCamera = new THREE.CubeCamera(0.1, 50, this.probeRenderTarget);
		this.probeCamera.position.copy(this.model.position);
	}

	#setupArmShading() {
		this.armShading = this.model.setupShading();
	}

	async #updateLightProbe() {
		if (this.probeUpdating || !this.lightProbe) return;
		this.probeUpdating = true;

		this.compositor.captureProbe(
			this.context.renderer,
			this.scene,
			this.probeCamera,
			[this.model],
		);

		try {
			const probe = await LightProbeGenerator.fromCubeRenderTarget(
				this.context.renderer,
				this.probeRenderTarget,
			);
			this.lightProbe.sh.copy(probe.sh);
			this.lightProbe.intensity = this.probeIntensity;
		} finally {
			this.probeUpdating = false;
		}
	}

	#calculateAspectRatio() {
		const { width, height } = this.context.getFullScreenDimensions();
		this.width = width;
		this.height = height;
		this.aspectRatio = this.width / this.height;
	}

	animate(delta, elapsed) {
		this.rig?.update(delta);

		this.model?.update(elapsed);
		this.floatingObjects?.update(elapsed);
		this.backgroundPlane?.update(this.camera);
		this.compositor?.update(elapsed);
	}

	render(renderer) {
		if (!this.compositor) {
			renderer.render(this.scene, this.camera);
			return;
		}
		this.compositor.render(renderer, this.scene, this.camera);
	}

	onResize(width, height) {
		this.width = width;
		this.height = height;
		this.aspectRatio = width / height;

		this.camera.aspect = this.aspectRatio;
		this.camera.updateProjectionMatrix();

		if (this.rig) {
			this.rig.distanceScale = this.#responsiveDistanceScale();
			this.floatingObjects?.setCellScale(this.rig.distanceScale);
		}

		this.compositor?.setSize(width, height, this.context.pixelRatio);
	}
}
