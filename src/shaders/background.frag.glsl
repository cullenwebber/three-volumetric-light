uniform vec3 uColorTop;
uniform vec3 uColorBottom;
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
	vec3 color = mix(uColorBottom, uColorTop, smoothstep(0.0, 1.0, vUv.y));
	gl_FragColor = vec4(color, 1.0);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>

	gl_FragColor.rgb +=
		(hash(uvec2(gl_FragCoord.xy)) - 0.5) * (1.5 / 255.0);
}
