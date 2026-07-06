import * as THREE from "three";
import vertexShader from "../shaders/beam.vert.glsl";
import fragmentShader from "../shaders/beam.frag.glsl";

const _direction = new THREE.Vector3();
const _right = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

export default class VolumetricBeam {
	constructor(spotLight, bounds) {
		this.light = spotLight;
		this.bounds = bounds;

		const direction = new THREE.Vector3()
			.subVectors(this.light.target.position, this.light.position)
			.normalize();
		const right = new THREE.Vector3()
			.crossVectors(direction, new THREE.Vector3(0, 1, 0))
			.normalize();
		const up = new THREE.Vector3().crossVectors(right, direction).normalize();

		const outer = this.light.angle;
		const inner = outer * (1.0 - this.light.penumbra);

		this.material = new THREE.ShaderMaterial({
			vertexShader,
			fragmentShader,
			defines: { STEPS: 16 },
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			depthTest: false,
			side: THREE.BackSide,
			uniforms: {
				uShadowMap: { value: null },
				uShadowMatrix: { value: this.light.shadow.matrix },
				uShadowReady: { value: false },
				uSceneDepth: { value: null },
				uDepthReady: { value: false },
				uResolution: { value: new THREE.Vector2(1, 1) },
				uCameraNear: { value: 0.1 },
				uCameraFar: { value: 100 },
				uCameraForward: { value: new THREE.Vector3(0, 0, -1) },
				uLightPosition: { value: this.light.position.clone() },
				uLightDirection: { value: direction },
				uBeamUp: { value: up },
				uBeamRight: { value: right },
				uCosInner: { value: Math.cos(inner) },
				uCosOuter: { value: Math.cos(outer) },
				uSinOuter: { value: Math.sin(outer) },
				uBoxMin: { value: this.bounds.min },
				uBoxMax: { value: this.bounds.max },
				uColorCore: { value: new THREE.Color(1, 1, 1) },
				uColorTop: { value: new THREE.Color(1, 0.737, 0.345) },
				uColorBottom: { value: new THREE.Color(0.063, 0.329, 0.549) },
				uCosHalo: { value: Math.cos(Math.min(outer * 2.4, 1.25)) },
				uHaloIntensity: { value: 0.35 },
				uShadowStrength: { value: 1.0 },
				uSmokeScale: { value: 1.5 },
				uSmokeStrength: { value: 1 },
				uSmokeRamp: { value: 3.0 },
				uIntensity: { value: 0.7 },
				uAttenuation: { value: 0.045 },
				uFalloff: { value: 0.125 },
				uTime: { value: 0 },
			},
		});

		const size = new THREE.Vector3().subVectors(bounds.max, bounds.min);
		const center = new THREE.Vector3()
			.addVectors(bounds.min, bounds.max)
			.multiplyScalar(0.5);

		const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
		this.mesh = new THREE.Mesh(geometry, this.material);
		this.mesh.position.copy(center);
		this.mesh.frustumCulled = false;
	}

	update(elapsed) {
		const uniforms = this.material.uniforms;
		uniforms.uTime.value = elapsed;

		_direction
			.subVectors(this.light.target.position, this.light.position)
			.normalize();
		uniforms.uLightDirection.value.copy(_direction);
		_right.crossVectors(_direction, _worldUp).normalize();
		uniforms.uBeamRight.value.copy(_right);
		uniforms.uBeamUp.value.crossVectors(_right, _direction).normalize();
		uniforms.uLightPosition.value.copy(this.light.position);

		const outer = this.light.angle;
		uniforms.uCosOuter.value = Math.cos(outer);
		uniforms.uCosInner.value = Math.cos(outer * (1.0 - this.light.penumbra));
		uniforms.uSinOuter.value = Math.sin(outer);
		uniforms.uCosHalo.value = Math.cos(Math.min(outer * 2.4, 1.25));

		if (!uniforms.uShadowReady.value && this.light.shadow.map) {
			uniforms.uShadowMap.value = this.light.shadow.map.depthTexture;
			uniforms.uShadowReady.value = true;
		}
	}
}
