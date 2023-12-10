export default `
precision highp float;

in vec3 in_position;
in vec3 in_normal;

/**
 * Varyings.
 */

out vec3 vWsNormal;
out vec3 vWsViewDir;
out vec3 vWsPosition;

/**
 * Uniforms List
 */

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

struct Camera
{
    mat4 WsToCs; // World-Space to Clip-Space (proj * view)
    vec3 position;
};
uniform Camera uCamera;

void main()
{
    vec4 positionLocal = vec4(in_position, 1.0);
    // Apply the model matrix to transform the vertex position to world space
    vec4 positionWorld = uSphere.modelMatrix * positionLocal;
    // Then apply the camera transformation to get the clip space position
    gl_Position = uCamera.WsToCs * positionWorld;

    // Pass the world space position to the fragment shader
    vWsPosition = positionWorld.xyz;
    // Transform the normal to world space
    vWsNormal = normalize(in_normal);
    // Transform the view direction to world space
    vWsViewDir = normalize(uCamera.position-positionWorld.xyz);
}
`;