export default `
precision highp float;

// All of those defines are overwritten by the engine
#define LIGHT_TYPE_DIRECTIONAL 0
#define LIGHT_TYPE_POINT 1

#define LIGHT_COUNT_DIRECTIONAL 1
#define LIGHT_COUNT_POINT 1
#define LIGHT_COUNT (LIGHT_COUNT_DIRECTIONAL + LIGHT_COUNT_POINT)

#define PI 3.1415926535897932384626433832795

in vec3 vWsNormal;
in vec3 vWsViewDir;
in vec3 vWsPosition;

out vec4 outFragColor;

struct Material
{
    vec3 albedo;
    float metallic;
    float roughness;
};

struct SphereProperties
{
    mat4 modelMatrix;
    Material material;
};
uniform SphereProperties uSphere;

struct LightProperties
{
    int type;
    vec3 position;
    vec3 direction;
    vec3 color;
    float intensity;
};
uniform LightProperties uLights[LIGHT_COUNT];

struct EnvironmentProperties
{
    sampler2D diffuse;
    sampler2D specular;
    sampler2D brdfLUT;
};
uniform EnvironmentProperties uEnvironment;

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

vec3 get_light_dir(in LightProperties light, in vec3 wsPosition) {
    if (light.type == LIGHT_TYPE_DIRECTIONAL) {
        return normalize(light.direction);
    } else if (light.type == LIGHT_TYPE_POINT) {
        return normalize(light.position - wsPosition);
    } else { return vec3(0.0); }
}

vec3 get_light_color(in LightProperties light, in vec3 wsPosition) {
    return light.color * light.intensity;
}

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

vec3 RGBMToRGB(vec4 rgbm, float rangeMultiplier) {
    return rgbm.rgb * rgbm.a * rangeMultiplier;
}

vec3 getSpecularColor(vec3 R, float roughness) {
    return vec3(0.0);
}

void main()
{
    vec3 color = vec3(0.0);

    vec3 N = normalize(vWsNormal);  // Normal
    vec3 V = normalize(vWsViewDir); // View direction
    vec3 R = reflect(-V, N);        // Reflection vector

    Material m = uSphere.material;
    vec3 albedo = sRGBToLinear(vec4(m.albedo, 1.0)).rgb;
    vec3 f0 = mix(vec3(0.04), albedo, m.metallic);

    vec3 irradiance = vec3(0.0);
    for (int i = 0; i < LIGHT_COUNT; ++i)
    {
        LightProperties light = uLights[i];
        vec3 L = get_light_dir(light, vWsPosition);
        vec3 H = normalize(V + L);
        vec3 radiance = get_light_color(light, vWsPosition);

        // Cook-Torrance BRDF
        float D = DistributionGGX(N, H, m.roughness);
        vec3 F = FresnelSchlick(max(dot(H, V), 0.0), f0);
        float G = GeometrySmith(N, V, L, m.roughness);

        vec3 numerator = D * G * F;
        float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0);
        vec3 specular = numerator / max(denominator, 0.001);

        // Add kS and kD from image, and multiply by NdotL
        vec3 kS = F;
        vec3 kD = vec3(1.0) - kS;
        kD *= 1.0 - m.metallic;

        // Lambertian diffuse
        vec3 diffuse = (kD * albedo) / PI;

        float NdotL = max(dot(N, L), 0.0);
        irradiance += (diffuse + specular) * radiance * NdotL;

    }
    color += irradiance;


    // Diffuse IBL
    vec2 diffuseUV = cartesianToPolar(N);
    // Remap x from [-PI, PI] to [0, 1]
    // Remap y from [-PI/2, PI/2] to [0, 1]
    diffuseUV = diffuseUV / vec2(PI, PI / 2.0) + vec2(0.5, 0.5);
    vec3 diffuseIBL = RGBMToRGB(texture(uEnvironment.diffuse, diffuseUV), 6.0) * albedo;
    color += diffuseIBL;

    // Specular IBL
    // TODO: Implement specular IBL

    outFragColor = LinearTosRGB(vec4(color, 1.0));
}
`;
