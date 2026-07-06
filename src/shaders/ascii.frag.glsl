uniform sampler2D uAtlas;
uniform float uGlyphCount;
uniform float uCellSize;
uniform vec3 uColor;
uniform vec3 uLightPosition;
uniform float uTime;
uniform float uMorph;

varying vec3 vNormal;
varying vec3 vWorldPos;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
	vec2 cell = floor(gl_FragCoord.xy / uCellSize);
	vec2 cellUv = fract(gl_FragCoord.xy / uCellSize);

	vec3 N = normalize(vNormal);
	vec3 L = normalize(uLightPosition - vWorldPos);
	vec3 V = normalize(cameraPosition - vWorldPos);
	float diffuse = clamp(dot(N, L), 0.0, 1.0);
	float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);

	float pulse = uMorph * (1.0 - uMorph) * 4.0;
	float grain = (hash(cell) - 0.5) * 0.3;
	float flicker =
		(hash(cell + floor(uTime * 6.0)) - 0.5) * (0.12 + 0.5 * pulse);
	float lum = clamp(diffuse * 0.7 + fresnel * 0.5 + grain + flicker, 0.0, 1.0);

	float glyph = floor(lum * (uGlyphCount - 1.0) + 0.5);
	vec2 atlasUv = vec2((glyph + cellUv.x) / uGlyphCount, cellUv.y);
	float mask = texture2D(uAtlas, atlasUv).r;

	float alpha = mask * (0.35 + 0.65 * lum);
	if (alpha < 0.02) discard;

	gl_FragColor = vec4(uColor * (0.4 + 1.1 * lum), alpha);

	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
