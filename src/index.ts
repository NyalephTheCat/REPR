import { GUI } from 'dat.gui';
import { mat4, vec3, quat } from 'gl-matrix';
import { Camera } from './camera';
import { GLContext } from './gl';
import { PBRShader } from './shader/pbr-shader';
import { Texture, Texture2D } from './textures/texture';
import { UniformType } from './types';
import {Geometry} from "./geometries/geometry";
import {SphereGeometry} from "./geometries/sphere";
import {DirectionalLight, PointLight, PonctualLight} from "./lights/lights";

interface GUIProperties {
  albedo: number[];
  light_colors: number[];
}

interface SphereAttributes {
  position: vec3,
  albedo: vec3,
  metallic: number,
  roughness: number,
}

enum LightType {
  POINT,
  DIRECTIONAL,
}

/**
 * Class representing the current application with its state.
 *
 * @class Application
 */
class Application {
  /**
   * Context used to draw to the canvas
   *
   * @private
   */
  private _context: GLContext;

  private _shader: PBRShader;
  private _geometry: Geometry;
  private _sphere_attibutes: Array<SphereAttributes>;
  private _uniforms: Record<string, UniformType | Texture>;

  private _numberOfSpheres: number = 5;

  private _textureExample: Texture2D<HTMLElement> | null;

  private _lights: Array<PonctualLight>;

  private _camera: Camera;

  private _mouseClicked: boolean;
  private _mouseCurrentPosition: { x: number, y: number };

  /**
   * Object updated with the properties from the GUI
   *
   * @private
   */
  private _guiProperties: GUIProperties;

  constructor(canvas: HTMLCanvasElement) {
    this._context = new GLContext(canvas);
    this._camera = new Camera();
    vec3.set(this._camera.position, 0.0, 0.0, 2.0);

    this._mouseClicked = false;
    this._mouseCurrentPosition = {x: 0, y: 0};

    this._geometry = new SphereGeometry(0.5, 32, 32);

    this._numberOfSpheres = 5;
    this._spawnSpheres(this._numberOfSpheres);
    this._lights = [
        new PointLight(),
    ];
    let l1 = this._lights[0] as PointLight;
    l1.setPosition(3.0, 3.0, 3.0);
    l1.setIntensity(1.0);
    l1.setColorRGB(1.0, 1.0, 1.0);


    this._uniforms = {
      'uAttributes.albedo': vec3.create(),
      'uCamera.WsToCs': mat4.create(),
    };

    this._shader = new PBRShader();
    this._textureExample = null;

    this._guiProperties = {
      albedo: [255, 255, 255],
      light_colors: [255, 255, 255],
    };

    this._createGUI();
  }

  /**
   * Initializes the application.
   */
  async init() {
    this._context.uploadGeometry(this._geometry);
    this._context.compileProgram(this._shader);

    // Example showing how to load a texture and upload it to GPU.
    this._textureExample = await Texture2D.load(
        'assets/ggx-brdf-integrated.png'
    );
    if (this._textureExample !== null) {
      this._context.uploadTexture(this._textureExample);
      // You can then use it directly as a uniform:
      // ```uniforms.myTexture = this._textureExample;```
    }

    // Event handlers (mouse and keyboard)
    canvas.addEventListener('keydown', this.onKeyDown, true);
    canvas.addEventListener('pointerdown', this.onPointerDown, true);
    canvas.addEventListener('pointermove', this.onPointerMove, true);
    canvas.addEventListener('pointerup', this.onPointerUp, true);
    canvas.addEventListener('pointerleave', this.onPointerUp, true);
  }

  /**
   * Called at every loop, before the [[Application.render]] method.
   */
  update() {
    /** Empty. */
  }

  /**
   * Called when the canvas size changes.
   */
  resize() {
    this._context.resize();
  }

  /**
   * Called at every loop, after the [[Application.update]] method.
   */
  render() {
    this._context.clear();
    this._context.setDepthTest(true);
    // this._context.setCulling(WebGL2RenderingContext.BACK);

    const props = this._guiProperties;

    // Set the color from the GUI into the uniform list.
    vec3.set(
        this._uniforms['uAttributes.albedo'] as vec3,
        props.albedo[0] / 255,
        props.albedo[1] / 255,
        props.albedo[2] / 255
    );

    // Sets the view projection matrix.
    const aspect = this._context.gl.drawingBufferWidth / this._context.gl.drawingBufferHeight;
    let WsToCs = this._uniforms['uCamera.WsToCs'] as mat4;
    mat4.multiply(WsToCs, this._camera.computeProjection(aspect), this._camera.computeView());

    this._uniforms['uCamera.position'] = this._camera.position;

    // Set the light counts
    this._shader.directionalLightCount = this._lights.filter((light) => light instanceof DirectionalLight).length;
    this._shader.pointLightCount = this._lights.filter((light) => light instanceof PointLight).length;

    // Iterate over the lights
    for (let i = 0; i < this._lights.length; i++) {
      let light = this._lights[i];

      // Set the light type
      let lightType = light instanceof DirectionalLight ? LightType.DIRECTIONAL : LightType.POINT;
      this._uniforms[`uLights[${i}].type`] = lightType;

      // Set the light position
      if (light instanceof DirectionalLight) {
        this._uniforms[`uLights[${i}].position`] = light.directionWS;
      } else {
        this._uniforms[`uLights[${i}].position`] = light.positionWS;
      }

      // Set the light color
      this._uniforms[`uLights[${i}].color`] = light.color;

      // Set the light intensity
      this._uniforms[`uLights[${i}].intensity`] = light.intensity;
    }

    for (let attr of this._sphere_attibutes) {
      // Set the position
      this._uniforms['uAttributes.position'] = attr.position;
      this._uniforms['uAttributes.metallic'] = attr.metallic;
      this._uniforms['uAttributes.roughness'] = attr.roughness;

      // Draws the geometry
      this._context.draw(this._geometry, this._shader, this._uniforms);
    }
  }

  /**
   * Creates a GUI floating on the upper right side of the page.
   *
   * ## Note
   *
   * You are free to do whatever you want with this GUI. It's useful to have
   * parameters you can dynamically change to see what happens.
   *
   *
   * @private
   */
  private _createGUI(): GUI {
    const gui = new GUI();

    gui.addColor(this._guiProperties, 'albedo');
    gui.addColor(this._guiProperties, 'light_colors').onChange((value) => {
      for (let light of this._lights) {
        light.setColorRGB(value[0] / 255, value[1] / 255, value[2] / 255);
      }
    });

    // GUI for spheres
    const sphereFolder = gui.addFolder('Spheres');
    sphereFolder.add(this, '_numberOfSpheres', 1, 100).onChange((value) => {
      this._spawnSpheres(value);
    });

    return gui;
  }

  _spawnSpheres(numberOfSpheres: number) {
    this._sphere_attibutes = [];

    // Spawns a grid of sphere attribute, changing the material and roughness in each direction
    let dist = 1.1  ;

    for (let i = 0; i < numberOfSpheres; i++) {
      for (let j = 0; j < numberOfSpheres; j++) {
        let x = i / numberOfSpheres * dist;
        let y = j / numberOfSpheres * dist;
        let z = 0.0;
        let position = vec3.fromValues(x, y, z);

        // Recenter the position
        vec3.add(position, position, vec3.fromValues(-dist / 2.0, -dist / 2.0, 0.0));

        // Space the spheres depending on the number
        let scale = numberOfSpheres;
        vec3.scale(position, position, scale);

        this._sphere_attibutes.push({
          position: position,
          albedo: vec3.fromValues(1.0, 1.0, 1.0),
          metallic: i / (numberOfSpheres - 1.0),
          roughness: j / (numberOfSpheres - 1.0),
        });
      }
    }
  }

  _spawnLights(numberOfLights: number) {
    this._lights = [];

    let dist = 20.0;

    // Generate lights
    let nb_lights = numberOfLights;
    for (let i = 0; i < nb_lights; i++) {
      let light = new PointLight();

      // Place lights every 360 / nb_lights degrees, at a distance of dist from the center, with an offset of 6.0 in the z direction
      let angle = i / nb_lights * 2.0 * Math.PI;
      let x = Math.cos(angle) * dist;
      let y = Math.sin(angle) * dist;
      let z = -6.0;

      vec3.set(light.positionWS, x, y, z);
      vec3.set(light.color, 1.0, 1.0, 1.0);
      light.intensity = 1.0;
      this._lights.push(light);
    }
  }

  /**
   * Handle keyboard and mouse inputs to translate and rotate camera.
   */
  onKeyDown(event: KeyboardEvent) {
    const speed = 0.2;

    let forwardVec = vec3.fromValues(0.0, 0.0, -speed);
    vec3.transformQuat(forwardVec, forwardVec, app._camera.rotation);
    let rightVec = vec3.fromValues(speed, 0.0, 0.0);
    vec3.transformQuat(rightVec, rightVec, app._camera.rotation);

    if (event.key == 'w' || event.key == 'ArrowUp') {
      vec3.add(app._camera.position, app._camera.position, forwardVec);
    } else if (event.key == 's' || event.key == 'ArrowDown') {
      vec3.add(app._camera.position, app._camera.position, vec3.negate(forwardVec, forwardVec));
    } else if (event.key == 'd' || event.key == 'ArrowRight') {
      vec3.add(app._camera.position, app._camera.position, rightVec);
    } else if (event.key == 'a' || event.key == 'ArrowLeft') {
      vec3.add(app._camera.position, app._camera.position, vec3.negate(rightVec, rightVec));
    }
  }

  onPointerDown(event: MouseEvent) {
    app._mouseCurrentPosition.x = event.clientX;
    app._mouseCurrentPosition.y = event.clientY;
    app._mouseClicked = true;
  }

  onPointerMove(event: MouseEvent) {
    if (!app._mouseClicked) {
      return;
    }

    const dx = event.clientX - app._mouseCurrentPosition.x;
    const dy = event.clientY - app._mouseCurrentPosition.y;
    const angleX = dy * 0.002;
    const angleY = dx * 0.002;
    quat.rotateX(app._camera.rotation, app._camera.rotation, angleX);
    quat.rotateY(app._camera.rotation, app._camera.rotation, angleY);

    app._mouseCurrentPosition.x = event.clientX;
    app._mouseCurrentPosition.y = event.clientY;
  }

  onPointerUp(event: MouseEvent) {
    app._mouseClicked = false;
  }

}


const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
const app = new Application(canvas as HTMLCanvasElement);
app.init();

function animate() {
  app.update();
  app.render();
  window.requestAnimationFrame(animate);
}
animate();

/**
 * Handles resize.
 */

const resizeObserver = new ResizeObserver((entries) => {
  if (entries.length > 0) {
    const entry = entries[0];
    canvas.width = window.devicePixelRatio * entry.contentRect.width;
    canvas.height = window.devicePixelRatio * entry.contentRect.height;
    app.resize();
  }
});

resizeObserver.observe(canvas);
