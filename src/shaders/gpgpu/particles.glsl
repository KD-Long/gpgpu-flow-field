// this shader handles the computation coming from the gpucomputation renderer
// since we only care about the pixels (remember we are using a texture which maps rgba values to pixel coordinates)
// we can skip the vertex shader and just use the fragment shader

// uniform sampler2D uParticles;  note uParticles is already available as a uniform because we added it to the shader in the compute step
uniform float uTime;
uniform sampler2D uBasePosition;
uniform float uDeltaTime;
uniform float uFlowFieldInfluence;
uniform float uFlowFieldStrength;
uniform float uFlowFieldFrequency;
#include ../includes/simplexNoise4d.glsl

void main() {
    //gl_FragCoord.xy -> pixel coordinates
    vec2 uv = gl_FragCoord.xy / resolution; // resolution is a uniform that is available to the shader
    // pick the particles from the uParticles texture using the uv coordinates
    vec4 particle = texture(uParticles, uv).rgba;

    vec4 basePosition = texture(uBasePosition, uv); // this is the initial position of the particle

    //check if particle is dead
    if(particle.a >= 1.0) {
        particle.xyz = basePosition.xyz;

        // instead of setting to 0 we set it to the remainder of the particle.a divided by 1.0
        // what this does is prevent massive deltas from different tabs open causing particles to die at the same time and start from the same position
        particle.a = mod(particle.a, 1.0); 
        // particle.a = 0.0;

    } else { // is alive then update with flowfield
        float time = uTime * 0.2;

        float strength = simplexNoise4d(vec4(basePosition.xyz * 0.2, time)); //returns a value between -1 and 1 // the *0.2 makes more particles have the same noise resulting in big chunks animating together

        float influence = (uFlowFieldInfluence - 0.5) * (-2.0);
        strength = smoothstep(influence, 1.0, strength); // remaps from 0->1 smoothly
        //if we are using a start point of 0.0 anything more negative will be 0 resulting in less active particles
        // we are using influence as a modifier to control the number of particles to shift

        //direction of the flow field
         // if we tried to do this without gpgpu the calcs would be too hard for cpu and cause extreme lag (249k particles * 4 calcs per particle = 996k calcs per frame)
        vec3 flowField = vec3(  // without time the noise would always be the same direction causing weird patterns we want every particle on every frame to get a different noise value
        simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 0.0, time)), //adding an offset to the particle to get a different noise value for each axis
        simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 1.0, time)),
        simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 2.0, time))
        );
        // at this point flowField is a vector of length 3 that is the direction of the flow field for the particle

        // Normalize the flowField to ensure consistent movement speed
        flowField = normalize(flowField);
        // at this point flowField is a vector of length 1 that is the direction of the flow field for the particle
        particle.xyz += flowField * uDeltaTime * strength * uFlowFieldStrength; // delta time normalise animation accross different framerates and strength of the flow field

        // Decay
        // each particle will decay over time and when it reaches 1 it will be reset to the initial position (boat)
        // we will use the alpha chanel in the particle texture to store the decay value
        particle.a += uDeltaTime * 0.6; // delta time normalise animation accross different framerates

    }

    gl_FragColor = vec4(particle);
}