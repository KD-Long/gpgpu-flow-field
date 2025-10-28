// ├─ (Self-contained component)
// ├─Loads model
// ├─ Initialises own GPGPU compute
// ├─ Manages own geometry/materials
// ├─ Renders particles
// └─ Exposes props for customisation

import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { extend, useFrame, useThree } from '@react-three/fiber';
import { Perf } from 'r3f-perf'
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

import { shaderMaterial, useGLTF } from '@react-three/drei';
import * as THREE from 'three'

import vertexShader from '../shaders/particles/vertex.glsl'
import fragmentShader from '../shaders/particles/fragment.glsl'
import gpgpuParticlesShader from '../shaders/gpgpu/particles.glsl'

// Helper function to sample a texture at UV coordinates
const sampleTexture = (texture, u, v) => {
    if (!texture.image) {
        return new THREE.Color(1, 1, 1); // White fallback
    }
    
    const image = texture.image;
    const width = image.width;
    const height = image.height;
    
    // Convert UV (0-1) to pixel coordinates
    const x = Math.floor(u * width) % width;
    const y = Math.floor((1 - v) * height) % height; // Flip V
    
    // Create canvas if needed to read pixel data
    if (!texture._pixelData) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        texture._pixelData = ctx.getImageData(0, 0, width, height).data;
    }
    
    const pixelIndex = (y * width + x) * 4;
    const r = texture._pixelData[pixelIndex + 0] / 255;
    const g = texture._pixelData[pixelIndex + 1] / 255;
    const b = texture._pixelData[pixelIndex + 2] / 255;
    
    return new THREE.Color(r, g, b);
}

const GPGPU = React.forwardRef(({
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
    modelPath = './static/model.glb',
    particleSize = 0.07,
    flowFieldInfluence = 0.5,
    flowFieldStrength = 2,
    flowFieldFrequency = 0.5,
    planeVisible = false,
}, ref) => {

    const { size, gl } = useThree();

    // Load model directly in this component
    const { nodes, materials } = useGLTF(modelPath);

    const gpuRef = useRef()
    const particlesVariableRef = useRef();
    const actualPointsGeoRef = useRef();
    const particlesRef = useRef()
    const planeRef = useRef()

    // State to track if GPGPU is initialized
    const [isGPUInitialised, setIsGPUInitialised] = useState(false);


    const MyShaderMaterial = shaderMaterial({
        uTime: 0,
        uSize: particleSize,
        uResolution: new THREE.Vector2(100, 100),
        uParticlesTexture: null,
    },
        vertexShader,
        fragmentShader
    )
    extend({ MyShaderMaterial: MyShaderMaterial })

    // Get the geometry from the loaded model
    const baseGeometry = useMemo(() => {
        //check nodes loaded in geo
        // console.log('Loaded nodes:', nodes);

        // Try specific boat model first
        if (nodes.boat?.geometry) {
            const geo = nodes.boat.geometry.clone();
            geo.setIndex(null);
            return geo;
        }

        // If no 'boat', merge all meshes with geometry
        const meshes = Object.values(nodes).filter(node => node.geometry);
        if (meshes.length > 0) {
            console.log('Found', meshes.length, 'meshes, merging all geometries...');
            
            // Prepare geometries for merging
            const geometriesToMerge = meshes.map(mesh => {
                const geo = mesh.geometry.clone();
                
                // Apply the WORLD transform matrix (includes all parent transforms)
                mesh.updateMatrixWorld(true);
                geo.applyMatrix4(mesh.matrixWorld);
                
                // Remove index to ensure non-indexed geometry
                geo.setIndex(null);
                return geo;
            });
            
            // Calculate total vertices
            let totalVertices = 0;
            geometriesToMerge.forEach(geo => {
                totalVertices += geo.attributes.position.count;
            });
            
            console.log('Merging', meshes.length, 'meshes with total', totalVertices, 'vertices');
            
            // Create merged geometry manually
            const mergedGeo = new THREE.BufferGeometry();
            const mergedPositions = new Float32Array(totalVertices * 3);
            const mergedColors = new Float32Array(totalVertices * 4);
            
            let vertexOffset = 0;
            let colorOffset = 0;
            
            geometriesToMerge.forEach((geo, meshIndex) => {
                const mesh = meshes[meshIndex];
                const positionAttr = geo.attributes.position;
                const uvAttr = geo.attributes.uv;
                
                // Try to get material texture
                let baseColorTexture = null;
                let materialColor = new THREE.Color(1, 1, 1); // Default white
                
                if (mesh.material) {
                    // Check for texture map first
                    if (mesh.material.map) {
                        baseColorTexture = mesh.material.map;
                    }
                    // Fall back to solid color
                    if (mesh.material.color) {
                        materialColor = mesh.material.color;
                    } else if (mesh.material.emissive) {
                        materialColor = mesh.material.emissive;
                    }
                }
                // logs successfully merged meshes and if the material has a texture or color
                console.log(`Mesh ${meshIndex} (${mesh.name}): texture =`, baseColorTexture ? '✓' : '✗', " material color =" + materialColor);
                
                // Copy positions
                for (let i = 0; i < positionAttr.count; i++) {
                    const i3 = i * 3;
                    const offset3 = vertexOffset * 3;
                    mergedPositions[offset3 + 0] = positionAttr.array[i3 + 0];
                    mergedPositions[offset3 + 1] = positionAttr.array[i3 + 1];
                    mergedPositions[offset3 + 2] = positionAttr.array[i3 + 2];
                    vertexOffset++;
                }
                
                // Copy or generate colors
                for (let i = 0; i < positionAttr.count; i++) {
                    const i4 = i * 4;
                    const offset4 = colorOffset * 4;
                    
                  if (baseColorTexture && uvAttr) {
                        // Sample texture at UV coordinates to bake color into vertices
                        const i2 = i * 2;
                        const u = uvAttr.array[i2 + 0];
                        const v = uvAttr.array[i2 + 1];
                        
                        // Sample texture (requires canvas or image data)
                        const sampledColor = sampleTexture(baseColorTexture, u, v);
                        mergedColors[offset4 + 0] = sampledColor.r;
                        mergedColors[offset4 + 1] = sampledColor.g;
                        mergedColors[offset4 + 2] = sampledColor.b;
                        mergedColors[offset4 + 3] = 1.0;
                    } else {
                        // Use material color if no vertex colors or textures (white if no material color)
                        mergedColors[offset4 + 0] = materialColor.r;
                        mergedColors[offset4 + 1] = materialColor.g;
                        mergedColors[offset4 + 2] = materialColor.b;
                        mergedColors[offset4 + 3] = 1.0;
                    }
                    colorOffset++;
                }
            });
            
            // Set attributes
            mergedGeo.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
            mergedGeo.setAttribute('color', new THREE.BufferAttribute(mergedColors, 4));
            
            console.log('Successfully merged', meshes.length, 'meshes into', totalVertices, 'vertices');
            return mergedGeo;
        }

        console.error('No geometry found in model!');
        return null;
    }, [nodes]);

    // Initialize GPGPU when geometry is available
    useEffect(() => {
        // this is to prevent the gpgpu from being initialised twice (react re-renders the component)
        if (!baseGeometry || isGPUInitialised) {
            console.log('Skipping GPGPU init:', { baseGeometry, isGPUInitialised });
            return;
        }
        
        console.log('Starting GPGPU initialization...');
        // 1) calc number of points in sphere (baseGeo)
        // 2) calc gpu size (sqrt(number of points))
        // 3) create gpu computation renderer
        // 4) create base particles texture (all black texture)
        // 5) create initial array of positions (baseGeo.attributes.position.array)
        // 6) set dependencies of particlesVariable to itself (particlesVariableRef.current)
        // 7) initialise the compute (gpuRef.current.init())
        // 8) create actual points geometry (actualPointsGeoRef.current)
        // 9) map particles to points (actualPointsGeoRef.current.setAttribute('aParticlesUv', new THREE.BufferAttribute(particlesUvArray, 2)))

        //GPU computation setup
        const baseGeo = baseGeometry;

        let countPoints = baseGeo.attributes.position.count

        // dimensions of canvas sqrt(1683) -> 41.0243829935 (round up to 42 the then we can just not use the extras)
        let gpuSize = Math.ceil(Math.sqrt(countPoints))

        gpuRef.current = new GPUComputationRenderer(gpuSize, gpuSize, gl)

        // Base particles 
        let baseParticlesTexture = gpuRef.current.createTexture() // creates black all black texture


        // create initial array of positions
        // remember position attribute is an array of 3 values per point (x,y,z) but one dimensional array
        for (let i = 0; i < countPoints; i++) {

            let i3 = i * 3
            let i4 = i * 4

            baseParticlesTexture.image.data[i4 + 0] = baseGeo.attributes.position.array[i3 + 0]
            baseParticlesTexture.image.data[i4 + 1] = baseGeo.attributes.position.array[i3 + 1]
            baseParticlesTexture.image.data[i4 + 2] = baseGeo.attributes.position.array[i3 + 2]
            baseParticlesTexture.image.data[i4 + 3] = Math.random() // this represents the decay value for the particle and offsets them so they dont all die at once

        }

        particlesVariableRef.current = gpuRef.current.addVariable('uParticles', gpgpuParticlesShader, baseParticlesTexture) // adds uParticles as a uniform to the shader (the blank texture)
        // gpuRef.current.addVariable('uTime', gpgpuParticlesShader, 0)         

        // Make that texture available as a uniform in the shader
        gpuRef.current.setVariableDependencies(particlesVariableRef.current, [particlesVariableRef.current]) // sets the dependencies of the particlesVariable to itself (this is because the shader needs to know the texture to update it)
        // essentially this adds the value for the next compute 

        // Add GPGPU uniforms
        particlesVariableRef.current.material.uniforms.uTime = new THREE.Uniform(0);
        particlesVariableRef.current.material.uniforms.uDeltaTime = new THREE.Uniform(0);
        particlesVariableRef.current.material.uniforms.uFlowFieldInfluence = new THREE.Uniform(flowFieldInfluence);
        particlesVariableRef.current.material.uniforms.uFlowFieldStrength = new THREE.Uniform(flowFieldStrength);
        particlesVariableRef.current.material.uniforms.uFlowFieldFrequency = new THREE.Uniform(flowFieldFrequency);

        // send original geometry texture to shader to use as initial value for each particle
        particlesVariableRef.current.material.uniforms.uBasePosition = new THREE.Uniform(baseParticlesTexture)
        // console.log( particlesVariableRef.current.material.uniforms.uBasePosition)
        // initialise the compute
        gpuRef.current.init()


        // the actual geometry for the points
        actualPointsGeoRef.current = new THREE.BufferGeometry();
        // not the actual position will be updated in the vertex shader based on the particles texture uniform
        actualPointsGeoRef.current.setDrawRange(0, countPoints);
        
        // Add a dummy position attribute (required by Three.js, even though we override in shader)
        const dummyPositions = new Float32Array(countPoints * 3).fill(0);
        actualPointsGeoRef.current.setAttribute('position', new THREE.BufferAttribute(dummyPositions, 3));

        // how we will map the particles to the points
        const particlesUvArray = new Float32Array(countPoints * 2) //x2 since uv is 2d
        const particleSizeArray = new Float32Array(countPoints)

        // loop through all coordinates of gpusize and assign them to the particlesUvArray
        for (let y = 0; y < gpuSize; y++) {
            for (let x = 0; x < gpuSize; x++) {

                const i = (y * gpuSize + x); // convert 2d grid to 1d array which we can iterate though the buffer with i
                const i2 = i * 2 // *2 will give us the second index in the array (x and y)

                // UV
                const uvX = (x + 0.5) / gpuSize;
                const uvY = (y + 0.5) / gpuSize;

                particlesUvArray[i2 + 0] = uvX;
                particlesUvArray[i2 + 1] = uvY;


                //size of the particle
                particleSizeArray[i] = Math.random();
            }
        }

        //NOTE: we are passing this attributes to our vertex shader

        // at this particlesUvArray contains the uv coordinates for each point
        // we can then pass this to the vertex shader as a buffer attribute
        actualPointsGeoRef.current.setAttribute('aParticlesUv', new THREE.BufferAttribute(particlesUvArray, 2))


        actualPointsGeoRef.current.setAttribute('aColor', baseGeo.attributes.color);


        actualPointsGeoRef.current.setAttribute('aParticleSize', new THREE.BufferAttribute(particleSizeArray, 1))


        setIsGPUInitialised(true);

    }, [gl, baseGeometry, isGPUInitialised, flowFieldInfluence, flowFieldStrength, flowFieldFrequency])


    // Update resolution uniform when window size changes
    // note this is working on the refs material not the shader material and this means it doesnt trigger a re-render of the shader material
    // react only rerenders when the state changes not the uniforms
    // this "size" comes from the useThree hook and is updated when the window size changes
    useEffect(() => {
        if (particlesRef.current && size.width && size.height) {
            particlesRef.current.material.uniforms.uResolution.value.set(
                size.width * Math.min(window.devicePixelRatio, 2),
                size.height * Math.min(window.devicePixelRatio, 2)
            )
        }
    }, [size.width, size.height])


    useFrame((state, delta) => {

        const elapsedTime = state.clock.elapsedTime

        // GPGPU computation
        if (gpuRef.current && particlesVariableRef.current) {

            // update uTime on particles shader before compute
            particlesVariableRef.current.material.uniforms.uTime.value = elapsedTime;
            particlesVariableRef.current.material.uniforms.uDeltaTime.value = delta; // detatime normalise animation accross different framerates
            particlesVariableRef.current.material.uniforms.uFlowFieldInfluence.value = flowFieldInfluence;
            particlesVariableRef.current.material.uniforms.uFlowFieldStrength.value = flowFieldStrength;
            particlesVariableRef.current.material.uniforms.uFlowFieldFrequency.value = flowFieldFrequency;

            gpuRef.current.compute()

            //temp testing plane material update
            // Get the computed texture
            const particlesTexture = gpuRef.current.getCurrentRenderTarget(particlesVariableRef.current).texture; // wrapper around the texture (threejs texture) 

            // // Apply it to your plane's material
            if (planeRef.current) {
                planeRef.current.material.map = particlesTexture;
            }
            // Pass to particles shader
            if (particlesRef.current) {
                particlesRef.current.material.uniforms.uParticlesTexture.value = particlesTexture;
                particlesRef.current.material.uniforms.uSize.value = particleSize
            }
        }

    })

    return (
        <>
            {/* Points geometry */}
            {isGPUInitialised && actualPointsGeoRef.current && (
                <points
                    ref={(node) => {
                        // Ref forwarding pattern: allows both internal and external ref access
                        // node = the actual THREE.Points object once created
                        
                        // Keep internal ref working for GPGPU's own logic (uniforms, geometry updates)
                        particlesRef.current = node;
                        
                        // Forward to parent's ref if provided (e.g. <GPGPU ref={myRef} />)
                        if (typeof ref === 'function') ref(node);  // Handle callback refs
                        else if (ref) ref.current = node;          // Handle object refs (useRef)
                    }}
                    position={position}
                    rotation={rotation}
                    scale={scale}
                    geometry={actualPointsGeoRef.current}
                    frustumCulled={false} // this stops the points from being culled by the camera (this could be bad for performance on big systems)
                >
                    <myShaderMaterial transparent side={THREE.DoubleSide} />
                </points>
            )}


            {/* Plane to visualise gpgpu computation */}
            {planeVisible && (
                < mesh
                    ref={planeRef}
                    position={position} // this offsets the position of the model to the param passed in by parent

                // visible={planeVisible} 
                >
                    <planeGeometry args={[3, 3]} />
                    {/* <myShaderMaterial transparent side={THREE.DoubleSide} /> */}
                    <meshBasicMaterial side={THREE.DoubleSide} />
                </mesh >
            )}
        </>
    )
})


export default GPGPU
