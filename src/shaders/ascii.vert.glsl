attribute vec3 aTargetPosition;
attribute vec3 aTargetNormal;

uniform float uMorph;
uniform float uTime;

varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
	float t = smoothstep(0.0, 1.0, uMorph);
	vec3 morphed = mix(position, aTargetPosition, t);
	vec3 nrm = normalize(mix(normal, aTargetNormal, t));

	float pulse = t * (1.0 - t) * 4.0;
	morphed += nrm * sin(morphed.x * 7.0 + morphed.y * 9.0 + uTime * 4.0) * 0.12 * pulse;

	vNormal = normalize(mat3(modelMatrix) * nrm);
	vec4 worldPos = modelMatrix * vec4(morphed, 1.0);
	vWorldPos = worldPos.xyz;
	gl_Position = projectionMatrix * viewMatrix * worldPos;
}
