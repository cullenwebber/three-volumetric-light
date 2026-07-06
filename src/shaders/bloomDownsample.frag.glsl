

uniform sampler2D tInput;
uniform vec2 uTexel;
#ifdef PREFILTER
uniform float uThreshold;
uniform float uKnee;
#endif
varying vec2 vUv;

void main() {
	vec3 a = texture2D(tInput, vUv + uTexel * vec2(-2.0,  2.0)).rgb;
	vec3 b = texture2D(tInput, vUv + uTexel * vec2( 0.0,  2.0)).rgb;
	vec3 c = texture2D(tInput, vUv + uTexel * vec2( 2.0,  2.0)).rgb;
	vec3 d = texture2D(tInput, vUv + uTexel * vec2(-2.0,  0.0)).rgb;
	vec3 e = texture2D(tInput, vUv).rgb;
	vec3 f = texture2D(tInput, vUv + uTexel * vec2( 2.0,  0.0)).rgb;
	vec3 g = texture2D(tInput, vUv + uTexel * vec2(-2.0, -2.0)).rgb;
	vec3 h = texture2D(tInput, vUv + uTexel * vec2( 0.0, -2.0)).rgb;
	vec3 i = texture2D(tInput, vUv + uTexel * vec2( 2.0, -2.0)).rgb;
	vec3 j = texture2D(tInput, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
	vec3 k = texture2D(tInput, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
	vec3 l = texture2D(tInput, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
	vec3 m = texture2D(tInput, vUv + uTexel * vec2( 1.0, -1.0)).rgb;

#ifdef PREFILTER
	vec3 boxCC = (j + k + l + m) * 0.25;
	vec3 boxTL = (a + b + d + e) * 0.25;
	vec3 boxTR = (b + c + e + f) * 0.25;
	vec3 boxBL = (d + e + g + h) * 0.25;
	vec3 boxBR = (e + f + h + i) * 0.25;
	float wCC = 0.5 / (1.0 + max(boxCC.r, max(boxCC.g, boxCC.b)));
	float wTL = 0.125 / (1.0 + max(boxTL.r, max(boxTL.g, boxTL.b)));
	float wTR = 0.125 / (1.0 + max(boxTR.r, max(boxTR.g, boxTR.b)));
	float wBL = 0.125 / (1.0 + max(boxBL.r, max(boxBL.g, boxBL.b)));
	float wBR = 0.125 / (1.0 + max(boxBR.r, max(boxBR.g, boxBR.b)));
	vec3 color = (boxCC * wCC + boxTL * wTL + boxTR * wTR + boxBL * wBL + boxBR * wBR)
		/ (wCC + wTL + wTR + wBL + wBR);

	float brightness = max(color.r, max(color.g, color.b));
	float soft = clamp(brightness - uThreshold + uKnee, 0.0, 2.0 * uKnee);
	soft = soft * soft / (4.0 * uKnee + 1e-4);
	color *= max(soft, brightness - uThreshold) / max(brightness, 1e-4);
#else
	vec3 color = e * 0.125
		+ (a + c + g + i) * 0.03125
		+ (b + d + f + h) * 0.0625
		+ (j + k + l + m) * 0.125;
#endif

	gl_FragColor = vec4(color, 1.0);
}
