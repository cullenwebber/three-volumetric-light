

uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;

void main() {
	vec2 d = uTexel * uRadius;
	vec3 color = texture2D(tInput, vUv + vec2(-d.x,  d.y)).rgb;
	color += texture2D(tInput, vUv + vec2( 0.0,  d.y)).rgb * 2.0;
	color += texture2D(tInput, vUv + vec2( d.x,  d.y)).rgb;
	color += texture2D(tInput, vUv + vec2(-d.x,  0.0)).rgb * 2.0;
	color += texture2D(tInput, vUv).rgb * 4.0;
	color += texture2D(tInput, vUv + vec2( d.x,  0.0)).rgb * 2.0;
	color += texture2D(tInput, vUv + vec2(-d.x, -d.y)).rgb;
	color += texture2D(tInput, vUv + vec2( 0.0, -d.y)).rgb * 2.0;
	color += texture2D(tInput, vUv + vec2( d.x, -d.y)).rgb;
	gl_FragColor = vec4(color / 16.0, 1.0);
}
