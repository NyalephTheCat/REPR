export default `
precision highp float;

#define DIRECTIONAL_LIGHT_COUNT 0
#define POINT_LIGHT_COUNT 1
#define LIGHT_COUNT (DIRECTIONAL_LIGHT_COUNT + POINT_LIGHT_COUNT)

#define LIGHT_TYPE_POINT 0
#define LIGHT_TYPE_DIRECTIONAL 1

#define PI 3.1415926535897932384626433832795

in vec3 vWsPosition;
in vec3 vWsNormal;
in vec3 vWsViewPosition;

out vec4 outFragColor;

struct Attributes
{
    vec3 position;
    vec3 albedo;
    float metallic;
    float roughness;
};
uniform Attributes uAttributes;

struct Light {
    int type;
    vec3 position;
    vec3 color;
    float intensity;
};
uniform Light uLights[LIGHT_COUNT];

// Convert a unit cartesian vector to polar coordinates
vec2 cartesianToPolar(vec3 cartesian) {
    // Compute azimuthal angle, in [-PI, PI]
    float phi = atan(cartesian.z, cartesian.x);
    // Compute polar angle, in [-PI/2, PI/2]
    float theta = asin(cartesian.y);
    return vec2(phi, theta);
}

// From three.js
vec4 sRGBToLinear( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}

// From three.js
vec4 LinearTosRGB( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}

vec3 getLightDirection(Light light) {
    if (light.type == LIGHT_TYPE_DIRECTIONAL) {
        return normalize(light.position);
    } else {
        vec3 light_pos_local = light.position + uAttributes.position;
        return normalize(light_pos_local - vWsPosition);
    }
}

vec3 getLightColor(Light light) {
    return sRGBToLinear(vec4(light.color, 1.0)).rgb * light.intensity;
}

// Lighting model

vec3 FresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

float GeometrySchlickGGX(float NdotV, float roughness) {
    float a = roughness + 1.0;
    float k = (a * a) / 8.0;
    return NdotV / (NdotV * (1.0 - k) + k);
}

float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx1 = GeometrySchlickGGX(NdotV, roughness);
    float ggx2 = GeometrySchlickGGX(NdotL, roughness);
    return ggx1 * ggx2;
}

float DistributionGGX(vec3 N, vec3 H, float roughness) {
    float a2 = roughness * roughness;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    return a2 / (PI * denom * denom);
}

// Main function
void main() {
    vec3 N = normalize(vWsNormal);   // Normal
    vec3 V = normalize(vWsViewPosition - vWsPosition); // View direction

    vec3 albedo = sRGBToLinear(vec4(uAttributes.albedo, 1.0)).rgb;
    float metallic = uAttributes.metallic;
    float roughness = uAttributes.roughness;

    vec3 F0 = vec3(0.04);
    F0 = mix(F0, albedo, metallic);

    vec3 irradiance = vec3(0.0);

    for (int i = 0; i < LIGHT_COUNT; ++i) {
        Light light = uLights[i];
        vec3 L = getLightDirection(light);
        vec3 H = normalize(V + L);
        vec3 radiance = getLightColor(light);

        // Cook-Torrance BRDF
        float D = DistributionGGX(N, H, roughness);
        vec3 F = FresnelSchlick(max(dot(H, V), 0.0), F0);
        float G = GeometrySmith(N, V, L, roughness);

        vec3 numerator = D * G * F;
        float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0);
        vec3 specular = numerator / denominator;

        // Add kS and kD from image, and multiply by NdotL
        vec3 kS = F;
        vec3 kD = vec3(1.0) - kS;
        kD *= 1.0 - metallic;

        // Lambertian diffuse
        vec3 diffuse = (kD * albedo) / PI;

        float NdotL = max(dot(N, L), 0.0);
        irradiance += (diffuse + specular) * radiance * NdotL;
    }

    // Output the final color
    outFragColor = vec4(irradiance, 1.0);
}

`;
