import * as THREE from "three";
import BentNormalBaker from "../baking/BentNormalBaker";

const UNIFORM_DECLARATIONS = `
uniform sampler2D uBentNormalMap;
uniform float uBentAOStrength;
uniform float uMicroShadowStrength;
uniform float uWrap;
`;

function neutralTexture(r, g, b, a) {
	const texture = new THREE.DataTexture(
		new Uint8Array([r, g, b, a]),
		1,
		1,
		THREE.RGBAFormat,
	);
	texture.needsUpdate = true;
	return texture;
}

function replaceOrWarn(source, anchor, replacement) {
	if (!source.includes(anchor)) {
		console.warn(
			`[BentNormalShading] shader anchor not found: "${anchor.slice(0, 60)}..."`,
		);
		return source;
	}
	return source.replace(anchor, replacement);
}

export default class BentNormalShading {
	constructor(target, options = {}) {
		const {
			bentNormalMap = null,
			bentAOStrength = 1,
			microShadowStrength = 1,
			wrap = 0,
		} = options;

		this.uniforms = {
			uBentNormalMap: {
				value: bentNormalMap ?? neutralTexture(128, 128, 255, 255),
			},
			uBentAOStrength: { value: bentAOStrength },
			uMicroShadowStrength: { value: microShadowStrength },
			uWrap: { value: wrap },
		};
		this.ownsNeutralMap = bentNormalMap === null;

		this.patched = [];
		target.traverse((child) => {
			if (!child.isMesh || !child.material?.isMeshStandardMaterial) return;
			this.patched.push({
				material: child.material,
				onBeforeCompile: child.material.onBeforeCompile,
				customProgramCacheKey: child.material.customProgramCacheKey,
			});
			child.material.onBeforeCompile = (shader) => this.#patch(shader);
			child.material.customProgramCacheKey = () => "bent-normal-shading";
			child.material.needsUpdate = true;
		});
	}

	static bakeAndApply(mesh, { baker = {}, ...options } = {}) {
		const shading = new BentNormalShading(mesh, options);
		shading.ready = new BentNormalBaker(baker)
			.bake(mesh.geometry)
			.then(({ bentNormalMap }) => {
				shading.setBentNormalMap(bentNormalMap);
				return shading;
			});
		return shading;
	}

	setBentNormalMap(bentNormalMap) {
		if (this.ownsNeutralMap) {
			this.uniforms.uBentNormalMap.value.dispose();
			this.ownsNeutralMap = false;
		}
		this.uniforms.uBentNormalMap.value = bentNormalMap;
	}

	dispose() {
		for (const entry of this.patched) {
			entry.material.onBeforeCompile = entry.onBeforeCompile;
			entry.material.customProgramCacheKey = entry.customProgramCacheKey;
			entry.material.needsUpdate = true;
		}
		this.patched.length = 0;
		if (this.ownsNeutralMap) {
			this.uniforms.uBentNormalMap.value.dispose();
			this.ownsNeutralMap = false;
		}
	}

	#patch(shader) {
		Object.assign(shader.uniforms, this.uniforms);

		const lightsChunk = THREE.ShaderChunk.lights_fragment_begin
			.replace(
				"irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );",
				"irradiance += getLightProbeIrradiance( lightProbe, bentNormal ) * bentAO;",
			)
			.replace(
				"getSpotLightInfo( spotLight, geometryPosition, directLight );",
 `getSpotLightInfo( spotLight, geometryPosition, directLight );

		{
			float aperture = 2.0 * bentAO * bentAO;
			float microShadow = saturate( abs( dot( bentNormal, directLight.direction ) ) + aperture - 1.0 );
			directLight.color *= mix( 1.0, microShadow, uMicroShadowStrength );
		}`,
			);

		const physicalChunk =
			THREE.ShaderChunk.lights_physical_pars_fragment.replace(
				"reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );",
 `float wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + uWrap ) / ( ( 1.0 + uWrap ) * ( 1.0 + uWrap ) ) );

	reflectedLight.directDiffuse += wrapNL * directLight.color * BRDF_Lambert( material.diffuseContribution );`,
			);

		shader.fragmentShader = UNIFORM_DECLARATIONS + shader.fragmentShader;

		shader.fragmentShader = replaceOrWarn(
			shader.fragmentShader,
			"#include <normal_fragment_maps>",
 `#include <normal_fragment_maps>

	vec4 bentSample = texture2D( uBentNormalMap, vNormalMapUv );
	vec3 bentNormal = normalize( tbn * ( bentSample.xyz * 2.0 - 1.0 ) );
	float bentAO = mix( 1.0, bentSample.a, uBentAOStrength );`,
		);

		shader.fragmentShader = replaceOrWarn(
			shader.fragmentShader,
			"#include <lights_fragment_begin>",
			lightsChunk,
		);

		shader.fragmentShader = replaceOrWarn(
			shader.fragmentShader,
			"#include <lights_physical_pars_fragment>",
			physicalChunk,
		);

		shader.fragmentShader = replaceOrWarn(
			shader.fragmentShader,
			"#include <aomap_fragment>",
 `#include <aomap_fragment>

	{
		float dotNVb = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNVb, bentAO, material.roughness );
	}`,
		);
	}
}
