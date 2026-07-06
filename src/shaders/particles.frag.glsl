#include <packing>

uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform bool uShadowReady;

uniform sampler2D uSceneDepth;
uniform bool uDepthReady;
uniform vec2 uResolution;
uniform float uCameraNear;
uniform float uCameraFar;

uniform float uIntensity;

varying vec3 vColor;
varying float vFade;
varying vec3 vWorldPosition;
varying float vViewZ;
varying float vBlur;

float hexDist(vec2 p) {
	p = abs(p);
	return max(dot(p, vec2(0.8660254, 0.5)), p.y) / 0.8660254;
}

void main() {

	float dist = hexDist(gl_PointCoord - 0.5);
	float inner = mix(0.36, 0.2, vBlur);
	float alpha = smoothstep(0.5, inner, dist);
	alpha *= mix(1.0, 0.7 + 0.6 * smoothstep(0.15, 0.45, dist), vBlur);
	if (alpha <= 0.01) discard;

	if (uDepthReady) {
		float depth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).x;
		if (depth < 1.0) {
			float sceneViewZ = perspectiveDepthToViewZ(depth, uCameraNear, uCameraFar);
			if (vViewZ < sceneViewZ) discard;
		}
	}

	float visibility = 1.0;
	if (uShadowReady) {
		vec4 coord = uShadowMatrix * vec4(vWorldPosition, 1.0);
		vec3 sc = coord.xyz / coord.w;
		if (sc.x >= 0.0 && sc.x <= 1.0 && sc.y >= 0.0 && sc.y <= 1.0 && sc.z <= 1.0) {
			visibility = texture(uShadowMap, vec3(sc.xy, sc.z - 0.002));
		}
	}

	gl_FragColor = vec4(vColor * alpha * vFade * visibility * uIntensity, 1.0);
}
