
GPGPU (general purpose computing on GPU) 
    - a way of using the GPU to process data rather than rendering pixels for end user
    - Great when you need to do the same complex calculations thousands of times

Flow field 
    - Spacial streams for any point in space, we calculate a direction
    - for any 3d point we calculate a direction and we use that direction to move the particle

Strategy:
    - remember the current particle position and store into a massive canvas (rgb mapped to xyz) - GPU
    - GPU to compute next position in the flow field
    - Instead of using the position attribute we are going to is the FBO(Frame buffer object - a texture) and updated by GPU
    - On each frame we update the FBO based on the previous frame

    - Off screen camera that looks at 2d plane containing our FBO canvas
    - Send texture, the initial position of the particle
    - instead of displaying the texture we will update each pixel(flow field) and save to fbo
    - on the next frame send updated FBO to the real scene

CODE FLOW:

### 1. **GPGPU Shader Computes** (runs on GPU):
```javascript
gpuRef.current.compute(); // Runs particles.glsl on GPU
// Output: Updated position data stored in a texture
```

### 2. **Get the Output Texture**:
```javascript
const particlesTexture = gpuRef.current.getCurrentRenderTarget(particlesVariableRef.current).texture;
// This is the GPGPU output - contains updated particle positions (RGBA = XYZ + random)
```

### 3. **Pass Texture to Particle Shader**:
```javascript
particlesRef.current.material.uniforms.uParticlesTexture.value = particlesTexture;
// Now your vertex shader can read the updated positions
```

### 4. **Vertex Shader Reads Texture**:
```glsl
// In vertex.glsl
vec4 particle = texture(uParticlesTexture, aParticlesUv);
// Reads the position from the GPGPU texture

vec4 modelPosition = modelMatrix * vec4(particle.xyz, 1.0);
// Uses that position to place the particle
```



Next steps:
1. [complete] refactor code such that I can reuse the GPGPU on any model import (maybe put gpgpu logic in its own component)
2. [complete] Try different models

bake colors into vertex attributes: https://www.youtube.com/watch?v=oZlAtz2mP5k 
export models with attributes: https://discourse.threejs.org/t/gltf-export-custom-attributes/12443/6


Guide to R3f:

Since the Portal lesson, I've been exclusively adapting all projects to React Three Fiber (R3F). This GPGPU flow field project was particularly challenging - the compute shader concepts were difficult to visualise and structure appropriately in a React component architecture.

My initial approach was to dump everything into `Experience.jsx` and refactor later once I understood the flow. Now that the project is complete, I wanted to share how I structured it and include some tips for anyone tackling this lesson with R3F.

Project structure:
├── src
│   ├── App.css
│   ├── App.jsx
│   ├── components
│   │   ├── Experience.jsx
│   │   ├── GPGPU.jsx
│   ├── index.css
│   ├── main.jsx
│   └── shaders
│       ├── gpgpu
│       │   └── particles.glsl
│       ├── includes
│       │   └── simplexNoise4d.glsl
│       └── particles
│           ├── fragment.glsl
│           └── vertex.glsl
── public
│   └── static
│       ├── 1969_Chevrolet_Corvette_Stingray_427.glb
│       ├── Asphalt (texture folder)
│       └── model.glb

## TL;DR - Architecture Overview

### Experience.jsx 
Handles scene-level setup: Leva controls, Perf monitoring, OrbitControls, lighting, environment, and background.
- Children: Instantiates `GPGPU` components, passing model paths and Leva tweak variables as props
- Refs: Can access GPGPU instances via refs for external manipulation (e.g., animations, transformations)

### GPGPU.jsx 
A fully encapsulated component that loads models, initialises GPGPU computation, and renders particles.

Key Lifecycle:
1. `useMemo`: Extracts and processes geometry from loaded model
   - Handles single-mesh models (e.g., boat)
   
   Additional to lesson:
   - Merges multi-mesh models, applying world transforms to preserve hierarchy
   - Samples texture UVs to bake colors into vertex attributes
   - No baked color attribute required
   
2. `useEffect`: GPGPU initialisation (runs once when geometry is ready)
   - Creates `GPUComputationRenderer` instance
   - Generates base particles texture from model vertex positions
   - Sets up compute shader variables and uniforms
   - Creates point geometry with attributes: `aParticlesUv`, `aColor`, `aParticleSize`
   - Initialises compute pipeline

3. `useFrame`: Per-frame updates (runs every frame)
   - Updates GPGPU shader uniforms (`uTime`, `uDeltaTime`, flow field params)
   - Triggers `gpuRef.current.compute()` to run compute shader
   - Passes computed texture to particle shader for rendering
   - Updates material uniforms (resolution, size, etc.)

### Working with Different Models

Challenge: Bruno's boat model had pre-baked vertex colors in Blender, but most models don't.

Solution: Automatic color extraction in `useMemo`:
1. Vertex colors (if present) → Use directly
2. Texture maps → Sample UVs to bake texture colors into vertices
3. Material colors → Extract solid colors from materials
4. Fallback → Generate default colors

This approach works with any GLTF/GLB model without Blender modifications.

Ref Forwarding: Uses `React.forwardRef` to expose the gpgpu object to parent components, enabling mesh position/rotation etc from experience.jsx

Final project:
https://gpgpu-flow-field.kyledlong.com/