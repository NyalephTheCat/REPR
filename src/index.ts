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

enum Environement {
    ALEXS_APARTMENT,
    INTERIOR,
}

interface EnvironmentTextures {
    diffuse: Texture2D<HTMLElement> | null;
    specular: Texture2D<HTMLElement> | null;
}

enum LightType {
    DIRECTIONAL,
    POINT,
    // TODO add more
}

interface Material {
    albedo: vec3;
    metallic: number;
    roughness: number;
}

interface SphereProperties {
    modelMatrix: mat4;
    material: Material;
}

interface GUIProperties {
    albedo: number[];
    environment: Environement;
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
    private _properties: SphereProperties[];
    private _uniforms: Record<string, UniformType | Texture>;

    private _lights: Array<PonctualLight>;

    private _brdfLUT: Texture2D<HTMLElement> | null;
    private _environments: Record<Environement, EnvironmentTextures>;
    private _currentEnvironment: Environement;

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
        vec3.set(this._camera.position, -0.5, -0.5, 10.0);

        this._mouseClicked = false;
        this._mouseCurrentPosition = { x: 0, y: 0 };

        this._geometry = new SphereGeometry(0.5, 32, 32);
        this._properties = [];
        this._uniforms = {};

        this._lights = [];

        this._shader = new PBRShader();

        this._brdfLUT = null;
        this._environments = {
            [Environement.ALEXS_APARTMENT]: {
                diffuse: null,
                specular: null,
            },
            [Environement.INTERIOR]: {
                diffuse: null,
                specular: null,
            },
        };
        this._currentEnvironment = Environement.ALEXS_APARTMENT;

        this._guiProperties = {
            albedo: [Math.random() * 255, Math.random() * 255, Math.random() * 255],
            environment: Environement.ALEXS_APARTMENT,
        };

        this._createGUI();
    }

    /**
     * Initializes the application.
     */
    async init() {
        this._context.uploadGeometry(this._geometry);
        this._context.compileProgram(this._shader);

        this._brdfLUT = await Texture2D.load('assets/ggx-brdf-integrated.png');
        if (this._brdfLUT !== null) {
            this._context.uploadTexture(this._brdfLUT);
        }

        this._environments[Environement.ALEXS_APARTMENT].diffuse = await Texture2D.load('assets/env/Alexs_Apt_2k-diffuse-RGBM.png');
        this._environments[Environement.ALEXS_APARTMENT].specular = await Texture2D.load('assets/env/Alexs_Apt_2k-specular-RGBM.png');
        this._environments[Environement.INTERIOR].diffuse = await Texture2D.load('assets/env/interior-diffuse-RGBM.png');
        this._environments[Environement.INTERIOR].specular = await Texture2D.load('assets/env/interior-specular-RGBM.png');

        const width = 5;
        const height = 5;
        for (let i = 0; i < width; i++) {
            for (let j = 0; j < height; j++) {
                const material: Material = {
                    albedo: vec3.fromValues(Math.random(), Math.random(), Math.random()),
                    metallic: Math.max(i / (width - 1), 0.001),
                    roughness: j / (height - 1)
                };

                const modelMatrix = mat4.create();
                mat4.translate(modelMatrix, modelMatrix, vec3.fromValues((i - width / 2) * 1.1, (j - height / 2) * 1.1, 0.0));

                this._properties.push({
                    modelMatrix: modelMatrix,
                    material: material
                });
            }
        }

        this._lights.push(new DirectionalLight()
            .setDirection(1.0, 1.0, 1.0)
            .setColorRGB(1.0, 1.0, 1.0)
            .setIntensity(1.0));

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
        // Update the albedos
        for (let i = 0; i < this._properties.length; i++) {
            const sphere = this._properties[i];

            sphere.material.albedo = vec3.fromValues(
                this._guiProperties.albedo[0] / 255.0,
                this._guiProperties.albedo[1] / 255.0,
                this._guiProperties.albedo[2] / 255.0
            );
        }

        // Update the environment
        if (this._guiProperties.environment !== this._currentEnvironment) {
            this._currentEnvironment = this._guiProperties.environment;
        }
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

        // Sets the view projection matrix.
        const aspect = this._context.gl.drawingBufferWidth / this._context.gl.drawingBufferHeight;
        if (!this._uniforms['uCamera.WsToCs']) { this._uniforms['uCamera.WsToCs'] = mat4.create(); }
        mat4.multiply(this._uniforms['uCamera.WsToCs'] as mat4, this._camera.computeProjection(aspect), this._camera.computeView());
        this._uniforms['uCamera.position'] = this._camera.position;

        if (this._brdfLUT !== null) {
            this._uniforms['uEnvironment.brdfLUT'] = this._brdfLUT;
        }
        if (this._environments[this._currentEnvironment].diffuse !== null) {
            this._context.uploadTexture(this._environments[this._currentEnvironment].diffuse!);
            this._uniforms['uEnvironment.diffuse'] = this._environments[this._currentEnvironment].diffuse!;
        }
        if (this._environments[this._currentEnvironment].specular !== null) {
            this._context.uploadTexture(this._environments[this._currentEnvironment].specular!);
            this._uniforms['uEnvironment.specular'] = this._environments[this._currentEnvironment].specular!;
        }

        this._shader.defines['LIGHTS_COUNT'] = this._lights.length;
        this._shader.defines['LIGHT_COUNT_DIRECTIONAL'] = this._lights.filter(l => l instanceof DirectionalLight).length;
        this._shader.defines['LIGHT_COUNT_POINT'] = this._lights.filter(l => l instanceof PointLight).length;
        this._shader.defines['LIGHT_TYPE_DIRECTIONAL'] = LightType.DIRECTIONAL;
        this._shader.defines['LIGHT_TYPE_POINT'] = LightType.POINT;
        for (let i = 0; i < this._lights.length; i++) {
            const prefix = `uLights[${i}].`;
            const light = this._lights[i];

            if (light instanceof DirectionalLight) {
                this._uniforms[prefix + 'type'] = LightType.DIRECTIONAL;
                this._uniforms[prefix + 'direction'] = light.directionWS;
            }
            else if (light instanceof PointLight) {
                this._uniforms[prefix + 'type'] = LightType.POINT;
                this._uniforms[prefix + 'position'] = light.positionWS;
            }
            else {
                throw new Error('Unknown light type for light ' + i + '.');
            }

            this._uniforms[prefix + 'color'] = light.color;
            this._uniforms[prefix + 'intensity'] = light.intensity;
        }

        // Set all the uniforms for the sphere properties
        this._shader.defines['SPHERES_COUNT'] = this._properties.length;
        for (let i = 0; i < this._properties.length; i++) {
            const prefix = `uSphere.`;
            const sphere = this._properties[i];

            this._uniforms[prefix + 'modelMatrix'] = sphere.modelMatrix;
            this._uniforms[prefix + 'material.albedo'] = sphere.material.albedo;
            this._uniforms[prefix + 'material.metallic'] = sphere.material.metallic;
            this._uniforms[prefix + 'material.roughness'] = sphere.material.roughness;

            // Draws the triangle.
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

        const env = { "ALEXS_APPARTMENT": Environement.ALEXS_APARTMENT, "Interior": Environement.INTERIOR  }

        gui.add(this._guiProperties, 'environment', env);
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

        if (event.key == 'w' || event.key == 'ArrowUp') {
            vec3.add(app._camera.position, app._camera.position, forwardVec);
        }
        else if (event.key == 's' || event.key == 'ArrowDown') {
            vec3.add(app._camera.position, app._camera.position, vec3.negate(forwardVec, forwardVec));
        }
        else if (event.key == 'd' || event.key == 'ArrowRight') {
            vec3.add(app._camera.position, app._camera.position, rightVec);
        }
        else if (event.key == 'a' || event.key == 'ArrowLeft') {
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
