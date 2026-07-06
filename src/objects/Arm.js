import * as THREE from "three";
import ImportGltf from "../utils/ImportGltf";
import BentNormalShading from "../materials/BentNormalShading";

const FINGERS = ["thumb", "index", "middle", "ring", "pinky"];

const FINGER_BONE_RE = /^(thumb|index|middle|ring|pinky)\.?(\d+)?$/;

export default class Arm extends THREE.Group {
	static async load(url) {
		const root = await new Promise((resolve, reject) => {
			new ImportGltf(url, { onLoad: resolve, onError: reject });
		});
		return new Arm(root);
	}

	constructor(root) {
		super();

		const box = new THREE.Box3().setFromObject(root);
		const size = box.getSize(new THREE.Vector3());
		root.scale.setScalar(3.2 / size.y);
		box.setFromObject(root);
		root.position.sub(box.getCenter(new THREE.Vector3()));

		this.mesh = null;
		this.handBone = null;
		this.handBaseY = 0;
		this.fingerBones = [];
		root.traverse((child) => {
			if (child.isMesh && !this.mesh) this.mesh = child;
			if (child.isBone) {
				if (child.name === "hand") {
					this.handBone = child;
					this.handBaseY = child.rotation.y;
					return;
				}
				const match = child.name.match(FINGER_BONE_RE);
				if (!match) return;
				this.fingerBones.push({
					bone: child,
					baseX: child.rotation.x,
					finger: FINGERS.indexOf(match[1]),
					segment: match[2] ? parseInt(match[2], 10) : 0,
				});
			}
		});

		this.add(root);
	}

	setupShading() {
		this.shading = BentNormalShading.bakeAndApply(this.mesh);
		return this.shading;
	}

	update(elapsed) {
		if (this.fingerBones.length) {

			const segmentRange = [
				[-0.05, 0.06],
				[-0.1, 0.05],
				[-0.2, 0.075],
				[-0.0, 0.5],
			];
			for (const { bone, baseX, finger, segment } of this.fingerBones) {
				const wave = Math.sin(elapsed * 2 + finger * 1.25 + segment * 0.15);
				const [min, max] = segmentRange[Math.min(segment, 3)];
				bone.rotation.x =
					baseX + THREE.MathUtils.lerp(min, max, wave * 0.5 + 0.5) * 0.75;
			}
		}

		if (this.handBone) {
			this.handBone.rotation.y =
				this.handBaseY +
				Math.sin(elapsed * 2 - 1.2) * 0.05 +
				Math.sin(elapsed * 0.7) * 0.05;
		}
	}
}
