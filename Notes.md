
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
1. refactor code such that I can reuse the GPGPU on any model import (maybe put gpgpu logic in its own component)
2. Try different models
3. Add a cool new effect on top? maybe transition to a different model