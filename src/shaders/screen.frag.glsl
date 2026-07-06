

uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tBeam;
uniform vec2 uBeamTexel;
uniform float uBloomStrength;
uniform float uGrainStrength;
uniform float uContrast;
uniform float uTime;

varying vec2 vUv;

float hash(uvec2 v) {
	v = v * 1664525u + 1013904223u;
	v.x += v.y * 1664525u;
	v.y += v.x * 1664525u;
	v ^= v >> 16u;
	v.x += v.y * 1664525u;
	v.y += v.x * 1664525u;
	v ^= v >> 16u;
	return float(v.x) * (1.0 / 4294967296.0);
}

void main() {

	vec3 beam = texture2D(tBeam, vUv).rgb * 0.4;
	beam += texture2D(tBeam, vUv + uBeamTexel * vec2( 0.9,  0.9)).rgb * 0.15;
	beam += texture2D(tBeam, vUv + uBeamTexel * vec2(-0.9,  0.9)).rgb * 0.15;
	beam += texture2D(tBeam, vUv + uBeamTexel * vec2( 0.9, -0.9)).rgb * 0.15;
	beam += texture2D(tBeam, vUv + uBeamTexel * vec2(-0.9, -0.9)).rgb * 0.15;

	vec3 color = texture2D(tScene, vUv).rgb
		+ texture2D(tBloom, vUv).rgb * uBloomStrength
		+ beam;

	gl_FragColor = vec4(color, 1.0);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>

	gl_FragColor.rgb = clamp(
		(gl_FragColor.rgb - 0.5) * uContrast + 0.5,
		0.0,
		1.0
	);

	uvec2 seed = uvec2(gl_FragCoord.xy)
		+ uvec2(mod( 60.0, 1024.0)) * uvec2(7919u, 104729u);
	gl_FragColor.rgb -= vec3(hash(seed)) * uGrainStrength;
}
