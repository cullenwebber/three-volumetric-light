import * as THREE from "three";
import vertexShader from "../shaders/background.vert.glsl";
import fragmentShader from "../shaders/background.frag.glsl";

const _forward = new THREE.Vector3();

export default class BackgroundPlane {
	constructor(z = -4.4) {
		this.z = z;
		this.material = new THREE.ShaderMaterial({
			uniforms: {
				uColorTop: { value: new THREE.Color(0x020409) },
				uColorBottom: { value: new THREE.Color(0x18262e) },
			},
			vertexShader,
			fragmentShader,
		});

		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
	}

	update(camera) {
		camera.getWorldDirection(_forward);
		const distance = (this.z - camera.position.z) / _forward.z;
		this.mesh.position
			.copy(camera.position)
			.addScaledVector(_forward, distance);
		this.mesh.quaternion.copy(camera.quaternion);

		const height =
			2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * distance;
		this.mesh.scale.set(height * camera.aspect * 1.02, height * 1.02, 1);
	}
}
