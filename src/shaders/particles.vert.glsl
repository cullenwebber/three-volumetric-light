attribute vec4 aSeed;

uniform float uTime;
uniform vec3 uLightPosition;
uniform vec3 uLightDirection;
uniform vec3 uBeamUp;
uniform vec3 uBeamRight;
uniform float uSinOuter;

uniform vec3 uColorCore;
uniform vec3 uColorTop;
uniform vec3 uColorBottom;

uniform float uLength;
uniform float uSpeed;
uniform float uSize;
uniform float uFocusDistance;
uniform float uFocusRange;

varying vec3 vColor;
varying float vFade;
varying vec3 vWorldPosition;
varying float vViewZ;
varying float vBlur;

void main() {

	float speed = uSpeed * (0.5 + aSeed.w);
	float along = mod(aSeed.x * uLength + uTime * speed, uLength);

	float radius = sqrt(aSeed.y);
	float theta = aSeed.z * 6.2831853 + uTime * 0.15 * (aSeed.w - 0.5);
	float coneRadius = (along + 0.5) * uSinOuter * 0.95;
	vec2 disk = vec2(cos(theta), sin(theta)) * radius * coneRadius;

	vec3 worldPos = uLightPosition
		+ uLightDirection * along
		+ uBeamRight * disk.x
		+ uBeamUp * disk.y;

	float signedV = disk.y / max(coneRadius, 0.001);
	vec3 edge = mix(uColorBottom, uColorTop, smoothstep(-1.1, 1.1, signedV));
	vColor = mix(uColorCore, edge, smoothstep(0.15, 0.85, abs(signedV)));

	vFade = smoothstep(0.0, 2.0, along)
		* (1.0 - smoothstep(uLength - 3.0, uLength, along));
	vFade *= (0.4 + 0.6 * aSeed.w) * exp(-along * 0.125);

	vWorldPosition = worldPos;
	vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
	vViewZ = mvPosition.z;

	vFade *= smoothstep(1.5, 4.0, -mvPosition.z);

	vBlur = clamp(
		abs(-mvPosition.z - uFocusDistance) / uFocusRange,
		0.0,
		1.0
	);

	vFade /= 1.0 + vBlur * 2.5;

	gl_PointSize = min(
		uSize * (0.6 + 0.8 * aSeed.w) * (30.0 / -mvPosition.z),
		uSize * 4.0
	) * (1.0 + vBlur * 2.5);
	gl_Position = projectionMatrix * mvPosition;
}
