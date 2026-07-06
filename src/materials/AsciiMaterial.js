import * as THREE from "three";
import vertexShader from "../shaders/ascii.vert.glsl";
import fragmentShader from "../shaders/ascii.frag.glsl";

const GLYPHS = " .:-=+*#%@";

function createGlyphAtlas(cell = 64) {
	const canvas = document.createElement("canvas");
	canvas.width = cell * GLYPHS.length;
	canvas.height = cell;
	const ctx = canvas.getContext("2d");

	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "#fff";
	ctx.font = `bold ${cell * 0.8}px monospace`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	for (let i = 0; i < GLYPHS.length; i++) {
		ctx.fillText(GLYPHS[i], (i + 0.5) * cell, cell * 0.55);
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	return texture;
}

export default function createAsciiMaterial({
	color = new THREE.Color(0xbfe3ff),
	cellSize = 10,
	lightPosition = new THREE.Vector3(-10, -3.5, -1),
} = {}) {
	return new THREE.ShaderMaterial({
		transparent: true,
		side: THREE.DoubleSide,
		uniforms: {
			uAtlas: { value: createGlyphAtlas() },
			uGlyphCount: { value: GLYPHS.length },
			uCellSize: { value: cellSize * Math.min(window.devicePixelRatio, 2) },
			uColor: { value: color },
			uLightPosition: { value: lightPosition },
			uTime: { value: 0 },
			uMorph: { value: 0 },
		},
		vertexShader,
		fragmentShader,
	});
}
