#include <packing>

varying vec3 vWorldPosition;

uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform bool uShadowReady;

uniform sampler2D uSceneDepth;
uniform bool uDepthReady;
uniform vec2 uResolution;
uniform float uCameraNear;
uniform float uCameraFar;
uniform vec3 uCameraForward;

uniform vec3 uLightPosition;
uniform vec3 uLightDirection;
uniform vec3 uBeamUp;
uniform vec3 uBeamRight;
uniform float uCosInner;
uniform float uCosOuter;
uniform float uSinOuter;

uniform vec3 uBoxMin;
uniform vec3 uBoxMax;

uniform vec3 uColorCore;
uniform vec3 uColorTop;
uniform vec3 uColorBottom;

uniform float uCosHalo;
uniform float uHaloIntensity;
uniform float uShadowStrength;

uniform float uSmokeScale;
uniform float uSmokeStrength;
uniform float uSmokeRamp;

uniform float uIntensity;
uniform float uAttenuation;
uniform float uFalloff;
uniform float uTime;

vec2 intersectBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
	vec3 inv = 1.0 / rd;
	vec3 t0 = (bmin - ro) * inv;
	vec3 t1 = (bmax - ro) * inv;
	vec3 tmin = min(t0, t1);
	vec3 tmax = max(t0, t1);
	return vec2(
		max(max(tmin.x, tmin.y), tmin.z),
		min(min(tmax.x, tmax.y), tmax.z)
	);
}

float shadowVisibility(vec3 worldPos) {
	if (!uShadowReady) return 1.0;
	vec4 coord = uShadowMatrix * vec4(worldPos, 1.0);
	vec3 sc = coord.xyz / coord.w;
	if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) {
		return 1.0;
	}

	return texture(uShadowMap, vec3(sc.xy, sc.z - 0.002));
}

float hash(vec2 p) {
	uvec2 v = uvec2(ivec2(floor(p)));
	v = v * 1664525u + 1013904223u;
	v.x += v.y * 1664525u;
	v.y += v.x * 1664525u;
	v ^= v >> 16u;
	v.x += v.y * 1664525u;
	v.y += v.x * 1664525u;
	v ^= v >> 16u;
	return float(v.x) * (1.0 / 4294967296.0);
}

uvec3 pcg3d(uvec3 v) {
	v = v * 1664525u + 1013904223u;
	v.x += v.y * v.z;
	v.y += v.z * v.x;
	v.z += v.x * v.y;
	v ^= v >> 16u;
	v.x += v.y * v.z;
	v.y += v.z * v.x;
	v.z += v.x * v.y;
	return v;
}

float hash3(vec3 p) {
	uvec3 v = pcg3d(uvec3(ivec3(floor(p))));
	return float(v.x) * (1.0 / 4294967296.0);
}

float valueNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
		mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
		u.y
	);
}

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 3; i++) {
		v += a * valueNoise(p);
		p *= 2.1;
		a *= 0.5;
	}
	return v;
}

float valueNoise3(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 u = f * f * (3.0 - 2.0 * f);
	float n000 = hash3(i);
	float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
	float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
	float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
	float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
	float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
	float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
	float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
	return mix(
		mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
		mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
		u.z
	);
}

float smokeFbm(vec3 p) {
	float v = 0.0;
	float a = 0.6;
	for (int i = 0; i < 2; i++) {
		v += a * valueNoise3(p);
		p *= 2.3;
		a *= 0.5;
	}
	return v;
}

vec3 sampleBeam(vec3 p) {
	vec3 toP = p - uLightPosition;
	float dist = length(toP);
	vec3 ld = toP / dist;

	float cosA = dot(ld, uLightDirection);

	float halo = pow(clamp((cosA - uCosHalo) / (1.0 - uCosHalo), 0.0, 1.0), 2.0);
	if (halo <= 0.001) return vec3(0.0);

	float angular = smoothstep(uCosOuter, uCosInner, cosA);

	float visibility = shadowVisibility(p);
	float attenuation = 1.0 / (1.0 + uAttenuation * dist * dist);

	attenuation *= exp(-dist * uFalloff);

	float coneRadius = max(dist * uSinOuter, 0.001);
	float signedV = clamp(dot(toP, uBeamUp) / coneRadius, -1.5, 1.5);

	vec3 color = mix(uColorBottom, uColorTop, smoothstep(-1.1, 1.1, signedV));
	color = mix(uColorCore, color, smoothstep(0.15, 0.85, abs(signedV)));

	float bandCoord = dot(toP, uBeamUp);
	float alongCoord = dot(toP, uBeamRight);
	float streak = fbm(vec2(
		bandCoord * 1.4 + uTime * 0.05,
		alongCoord * 0.12 - uTime * 0.02
	));
	streak = 0.7 + 0.6 * streak;

	float smokeAmount = uSmokeStrength * smoothstep(2.0, uSmokeRamp, dist);
	float smoke = 1.0;
	if (smokeAmount > 0.01) {
		vec3 smokeCoord = p * uSmokeScale
			+ vec3(0.0, uTime * 0.1, 0.0)
			- uLightDirection * (uTime * 0.5);
		smoke = mix(1.0, 0.35 + 1.3 * smokeFbm(smokeCoord), smokeAmount);
	}

	float shade = mix(1.0, visibility, uShadowStrength);

	vec3 hazeColor = mix(color, vec3(dot(color, vec3(0.333))), 0.45 * smoothstep(0.8, 1.5, abs(signedV)));
	vec3 beam = color * angular * streak * visibility * smoke;
	vec3 haze = hazeColor * halo * uHaloIntensity * mix(1.0, smoke, 0.35) * shade;

	vec3 dEdge = min(p - uBoxMin, uBoxMax - p);
	float edgeFade = smoothstep(0.0, 1.4, min(dEdge.y, dEdge.z));

	return (beam + haze) * attenuation * edgeFade * uIntensity;
}

float ignDither(vec2 p) {
	p += mod(floor(uTime * 60.0), 64.0) * 5.588238;
	return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
	vec3 ro = cameraPosition;
	vec3 rd = normalize(vWorldPosition - cameraPosition);

	vec2 hit = intersectBox(ro, rd, uBoxMin, uBoxMax);
	float tNear = max(hit.x, 0.0);
	float tFar = hit.y;

	if (uDepthReady) {
		float depth = texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).x;
		if (depth < 1.0) {
			float viewZ = perspectiveDepthToViewZ(depth, uCameraNear, uCameraFar);
			float tScene = -viewZ / max(dot(rd, uCameraForward), 0.0001);
			tFar = min(tFar, tScene);
		}
	}
	if (tFar <= tNear) discard;

	float stepLength = (tFar - tNear) / float(STEPS);
	float dither = ignDither(gl_FragCoord.xy);
	float t = tNear + dither * stepLength;

	vec3 accumulated = vec3(0.0);
	for (int i = 0; i < STEPS; i++) {
		vec3 p = ro + rd * t;
		accumulated += sampleBeam(p) * stepLength;
		t += stepLength;
	}

	gl_FragColor = vec4(accumulated, 1.0);
}
