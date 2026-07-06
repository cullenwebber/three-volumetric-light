import * as THREE from "three";

export default class LightGradient {
	constructor(spotLight, beamUniforms, { blueSpread = 2 } = {}) {
		this.light = spotLight;
		this.beamUniforms = beamUniforms;

		this.blueSpread = blueSpread;

		this.canvas = document.createElement("canvas");
		this.canvas.width = 4;
		this.canvas.height = 256;

		this.texture = new THREE.CanvasTexture(this.canvas);
		this.texture.colorSpace = THREE.SRGBColorSpace;
		this.light.map = this.texture;

		this.update();
	}

	update() {
		const core = this.beamUniforms.uColorCore.value;
		const top = this.beamUniforms.uColorTop.value;
		const bottom = this.beamUniforms.uColorBottom.value;

		const { width, height } = this.canvas;
		const ctx = this.canvas.getContext("2d");
		const color = new THREE.Color();
		const edge = new THREE.Color();

		for (let y = 0; y < height; y++) {

			const signedV = 1 - (2 * y) / (height - 1);
			const vertical = THREE.MathUtils.smoothstep(signedV, -1.1, 1.1);
			const coreMix = THREE.MathUtils.smoothstep(Math.abs(signedV), 0.15, 0.85);

			edge.copy(bottom).lerp(top, vertical);
			color.copy(core).lerp(edge, coreMix);

			const bluePush =
				THREE.MathUtils.smoothstep(-signedV, 0.0, 0.9) * this.blueSpread;
			color.lerp(bottom, bluePush);

			ctx.fillStyle = color.getStyle();
			ctx.fillRect(0, y, width, 1);
		}

		this.texture.needsUpdate = true;
	}
}
