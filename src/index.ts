import { GUI } from 'dat.gui';
import {mat4, vec3, quat} from 'gl-matrix';
import { Camera } from './camera';
import { GLContext } from './gl';
import { PBRShader } from './shader/pbr-shader';
import { Texture, Texture2D } from './textures/texture';
import { UniformType } from './types';
import {SphereGeometry} from "./geometries/sphere";
import {DirectionalLight, PointLight, PonctualLight} from "./lights/lights";

enum LightType {
  DIRECTIONAL,
  POINT,
}

interface Material {
  albedo: number[];
  metallic: number;
  roughness: number;
}

interface Light {
  color: number[];
  intensity: number;
}

interface GUIProperties {
  material: Material;
  light: Light;
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
  private _geometry: SphereGeometry;
  private _uniforms: Record<string, UniformType | Texture>;

  private _textures: Array<Texture2D<HTMLElement>>;
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

    this._lights = [
      new PointLight(),
    ];
    this._lights[0].positionWS = vec3.set(vec3.create(), 0.0, 0.0, 2.0);

    this._mouseClicked = false;
    this._mouseCurrentPosition = { x: 0, y: 0 };

    this._geometry = new SphereGeometry(0.5, 32, 32);
    this._uniforms = {
    };

    this._shader = new PBRShader();
    this._textures = [];

    this._guiProperties = {
      material: {
        albedo: [255, 255, 255],
        metallic: 0.0,
        roughness: 0.0,
      },
      light: {
        color: [255, 255, 255],
        intensity: 1.0,
      },
    };

    this._createGUI();
  }

  /**
   * Initializes the application.
   */
  async init() {
    this._context.uploadGeometry(this._geometry);
    this._context.compileProgram(this._shader);

    // TODO: Load textures here

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
  update() {}

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
    this._context.setCulling(WebGL2RenderingContext.BACK);

    const props = this._guiProperties;

    // Update materials
    if (!this._uniforms['uMaterial.albedo']) { this._uniforms['uMaterial.albedo'] = vec3.create(); }
    vec3.set(
        this._uniforms['uMaterial.albedo'] as vec3,
        props.material.albedo[0] / 255,
        props.material.albedo[1] / 255,
        props.material.albedo[2] / 255
    )
    this._uniforms['uMaterial.metallic'] = props.material.metallic;
    this._uniforms['uMaterial.roughness'] = props.material.roughness;

    // Update Lights
    for (let i = 0; i < this._lights.length; ++i) {
      const light = this._lights[i];
      if (light instanceof DirectionalLight) {
        this._uniforms[`lights[${i}].type`] = LightType.DIRECTIONAL;
        this._uniforms[`lights[${i}].position`] = light.directionWS;
        this._uniforms[`lights[${i}].color`] = light.color;
        this._uniforms[`lights[${i}].intensity`] = light.intensity;
      } else if (light instanceof PointLight) {
        this._uniforms[`lights[${i}].type`] = LightType.POINT;
        this._uniforms[`lights[${i}].position`] = light.positionWS;
        this._uniforms[`lights[${i}].color`] = light.color;
        this._uniforms[`lights[${i}].intensity`] = light.intensity;
      }
    }

    // Update camera
    const aspectRatio = this._context.gl.drawingBufferWidth / this._context.gl.drawingBufferHeight;
    if (!this._uniforms['uCamera.WsToCs']) { this._uniforms['uCamera.WsToCs'] = mat4.create(); }
    mat4.multiply(
        this._uniforms['uCamera.WsToCs'] as mat4,
        this._camera.computeProjection(aspectRatio),
        this._camera.computeView()
    );
    this._uniforms['uCamera.position'] = this._camera.position;

    // Draw the geometry.
    this._context.draw(this._geometry, this._shader, this._uniforms);
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

    const materialFolder = gui.addFolder('Material');
    materialFolder.addColor(this._guiProperties.material, 'albedo');
    materialFolder.add(this._guiProperties.material, 'metallic', 0.0, 1.0);
    materialFolder.add(this._guiProperties.material, 'roughness', 0.0, 1.0);
    materialFolder.open();

    const lightsFolder = gui.addFolder('Lights');
    // Change the light properties as a group
    lightsFolder.addColor(this._guiProperties.light, 'color').onChange((color) => {
      for (let i = 0; i < this._lights.length; ++i) {
        this._lights[i].color = [
          color[0] / 255,
          color[1] / 255,
          color[2] / 255,
        ];
      }
    });
    lightsFolder.add(this._guiProperties.light, 'intensity', 0.0, 10.0).onChange((intensity) => {
      for (let i = 0; i < this._lights.length; ++i) {
        this._lights[i].intensity = intensity;
      }
    });
    lightsFolder.open();

    // TODO: Add gui here

    return gui;
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

    if (event.key == 'z' || event.key == 'ArrowUp') {
      vec3.add(app._camera.position, app._camera.position, forwardVec);
    }
    else if (event.key == 's' || event.key == 'ArrowDown') {
      vec3.add(app._camera.position, app._camera.position, vec3.negate(forwardVec, forwardVec));
    }
    else if (event.key == 'd' || event.key == 'ArrowRight') {
      vec3.add(app._camera.position, app._camera.position, rightVec);
    }
    else if (event.key == 'q' || event.key == 'ArrowLeft') {
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