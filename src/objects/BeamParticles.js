import * as THREE from "three";
import vertexShader from "../shaders/particles.vert.glsl";
import fragmentShader from "../shaders/particles.frag.glsl";

export default class BeamParticles {
	constructor(beam, count = 14, options = {}) {
		const {
			length = 18,
			speed = 0.6,
			size = 6,
			intensity = 0.1,
			focusDistance = 8.0,
			focusRange = 1.0,
		} = options;
		const beamUniforms = beam.material.uniforms;

		const geometry = new THREE.BufferGeometry();
		const positions = new Float32Array(count * 3);
		const seeds = new Float32Array(count * 4);
		for (let i = 0; i < count * 4; i++) {
			seeds[i] = Math.random();
		}
		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));

		this.material = new THREE.ShaderMaterial({
			vertexShader,
			fragmentShader,
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			depthTest: false,
			uniforms: {
				uTime: beamUniforms.uTime,
				uLightPosition: beamUniforms.uLightPosition,
				uLightDirection: beamUniforms.uLightDirection,
				uBeamUp: beamUniforms.uBeamUp,
				uBeamRight: beamUniforms.uBeamRight,
				uSinOuter: beamUniforms.uSinOuter,
				uColorCore: beamUniforms.uColorCore,
				uColorTop: beamUniforms.uColorTop,
				uColorBottom: beamUniforms.uColorBottom,
				uShadowMap: beamUniforms.uShadowMap,
				uShadowMatrix: beamUniforms.uShadowMatrix,
				uShadowReady: beamUniforms.uShadowReady,
				uSceneDepth: beamUniforms.uSceneDepth,
				uDepthReady: beamUniforms.uDepthReady,
				uResolution: beamUniforms.uResolution,
				uCameraNear: beamUniforms.uCameraNear,
				uCameraFar: beamUniforms.uCameraFar,
				uLength: { value: length },
				uSpeed: { value: speed },
				uSize: { value: size },
				uIntensity: { value: intensity },
				uFocusDistance: { value: focusDistance },
				uFocusRange: { value: focusRange },
			},
		});

		this.points = new THREE.Points(geometry, this.material);
		this.points.frustumCulled = false;
	}
}
