import * as THREE from "three";
import { easing } from "maath";

export class CameraRig {

	constructor(camera, options = {}) {
		this.camera = camera;
		this.target = options.target || new THREE.Vector3(0, 0, 0);
		this.xLimit = options.xLimit || null;
		this.yLimit = options.yLimit || null;
		this.zLimit = options.zLimit || null;
		this.smoothTime = options.smoothTime ?? 0.25;
		this.distanceScale = 1;

		this.basePosition = camera.position.clone();

		this.pointer = { x: 0, y: 0 };

		this._onMouseMove = (event) => {
			this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
			this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
		};
		window.addEventListener("mousemove", this._onMouseMove);
	}

	_mapToLimit(pointer, base, limit) {
		if (!limit) return base;
		return pointer >= 0
			? THREE.MathUtils.lerp(base, limit[1], pointer)
			: THREE.MathUtils.lerp(base, limit[0], -pointer);
	}

	update(delta) {
		const targetX = this._mapToLimit(
			this.pointer.x,
			this.basePosition.x,
			this.xLimit,
		);
		const targetY = this._mapToLimit(
			this.pointer.y,
			this.basePosition.y,
			this.yLimit,
		);

		const targetZ =
			(this.zLimit
				? THREE.MathUtils.lerp(
						this.zLimit[0],
						this.zLimit[1],
						Math.min(Math.abs(this.pointer.x), 1),
					)
				: this.basePosition.z) * this.distanceScale;

		easing.damp(this.camera.position, "x", targetX, this.smoothTime, delta);
		easing.damp(this.camera.position, "y", targetY, this.smoothTime, delta);
		easing.damp(this.camera.position, "z", targetZ, this.smoothTime, delta);

		this.camera.lookAt(this.target);
	}

	dispose() {
		window.removeEventListener("mousemove", this._onMouseMove);
	}
}
