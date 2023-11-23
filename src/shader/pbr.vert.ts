export default `

precision highp float;

in vec3 in_position;
in vec3 in_normal;
#ifdef USE_UV
  in vec2 in_uv;
#endif // USE_UV

/**
 * Varyings.
 */

out vec3 vWsPosition;
out vec3 vWsNormal;
out vec3 vWsViewPosition;
#ifdef USE_UV
  out vec2 vUv;
#endif // USE_UVs

/**
 * Uniforms List
 */

struct Camera
{
  mat4 WsToCs; // World-Space to Clip-Space (proj * view)
  vec3 position;
};
uniform Camera uCamera;

struct Attributes
{
  vec3 position;
  vec3 albedo;
  float metallic;
  float roughness;
};
uniform Attributes uAttributes;

void
main()
{
  vWsPosition = in_position + uAttributes.position;

  vec4 positionLocal = vec4(vWsPosition, 1.0);
  gl_Position = uCamera.WsToCs * positionLocal;

  // Normalize normal between 0, 1.
  vWsNormal = normalize(in_normal) * 0.5 + 0.5;

  // Pass view position.
  vWsViewPosition = uCamera.position - vWsPosition;

  // Pass UVs.
#ifdef USE_UV
    vUv = in_uv;
#endif // USE_UV
}
`;
