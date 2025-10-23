uniform vec2 uResolution;
uniform float uSize;
uniform sampler2D uParticlesTexture; // this is the updated texture from the gpgpu computation

varying vec3 vColor;

attribute vec2 aParticlesUv; // this is the mapped version of point to the texture uv (essentially for each point this attribute has the corresponding uv coordinate)
attribute vec4 aColor; // this is the colour of the particle
attribute float aParticleSize; // this is the random size calc of the particle

void main() {

    // get the position from the particles texture using the uv coordinate
    vec4 particle = texture(uParticlesTexture, aParticlesUv);
    // particles now contains the position of the particle in the texture
    //replace the position with the position from the particles texture

    // Final position

    vec4 modelPosition = modelMatrix * vec4(particle.xyz, 1.0);
    // vec4 modelPosition = mo delMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    // Point size
    // we want each particle to grow  at the start of the animation and then shrink as it dies
    // particle.a is the decay value 0->1
    float sizeIn = smoothstep(0.0, 0.1, particle.a); // particles with decay values less than 0.1 will start with smaller size
    float sizeOut = 1.0 - smoothstep(0.7, 1.0, particle.a); // smooth step returns particles with values greater than 0.7 as a range of 0->1, then the 1 - ... will result in the.7 particle size -0 while the 1.0 particle size -1

    float size = min(sizeIn, sizeOut);
    // this will result in the smallest size of the two meaning when its low decay its small and when middle decay its large and then when its high decay its small again
    // making th pixels look like they fade away

    gl_PointSize = size * aParticleSize * uSize * uResolution.y;
    gl_PointSize *= (1.0 / -viewPosition.z);

    // Varyings
    vColor = vec3(aColor.r, aColor.g, aColor.b);
}