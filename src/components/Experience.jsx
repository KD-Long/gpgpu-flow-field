import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { extend, useFrame, useThree } from '@react-three/fiber';
import { Perf } from 'r3f-perf'
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

import { shaderMaterial, useTexture, OrbitControls } from '@react-three/drei';
import { Model } from './Model'
import { useControls } from 'leva'
import * as THREE from 'three'

import vertexShader from '../shaders/particles/vertex.glsl'
import fragmentShader from '../shaders/particles/fragment.glsl'
import gpgpuParticlesShader from '../shaders/gpgpu/particles.glsl'

const Experience = () => {

    const { size, gl, camera, scene } = useThree();

    const gpuRef = useRef()
    const particlesVariableRef = useRef();
    const planeRef = useRef();
    const actualPointsGeoRef = useRef();
    const baseGeoRef = useRef(); // Store the geometry from Model

    const particlesRef = useRef()

    // State to track if GPGPU is initialized
    const [isGPUInitialised, setIsGPUInitialised] = useState(false);

    let { bgColor, uSize, flowFieldInfluence, flowFieldStrength, flowFieldFrequency } = useControls({
        bgColor: { value: '#1d1f2a', label: 'Background Color' },
        // color1: { value: '#89ff00', label: 'color1' },
        // color2: { value: '#0000ff', label: 'color2' },
        // progress: { value: 0.0, min: 0.0, max: 1.0, step: 0.01 },
        uSize: { value: 0.07, min: 0.01, max: 1.0, step: 0.01 },
        flowFieldInfluence: { value: 0.5, min: 0.0, max: 1.0, step: 0.001 },
        flowFieldStrength: { value: 2, min: 0.0, max: 10.0, step: 0.001 },
        flowFieldFrequency: { value: 0.5, min: 0.0, max: 1.0, step: 0.001 },
    });


    const MyShaderMaterial = shaderMaterial({
        uTime: 0,
        uSize: uSize,
        uResolution: new THREE.Vector2(100, 100),
        uParticlesTexture: null,

    },
        vertexShader,
        fragmentShader
    )
    //this exent allows it to be used a a component below
    // Note: When using "extend" which register custom components with the JSX reconciler, 
    // use lowercase names for those components, regardless of how they are initially defined.
    extend({ MyShaderMaterial: MyShaderMaterial })


    // Callback to receive geometry from Model component
    const handleGeometryLoad = useCallback((geometry) => {
        // Clone geometry (DON'T remove index - it reorders vertices!)
        const geo = geometry.clone();
        // geo.setIndex(null); // Removing this causes vertex reordering!
        baseGeoRef.current = geo;
        console.log('Base geo attributes:', geo.attributes);
    }, []);

    // Initialize GPGPU when baseGeo is available
    useEffect(() => {
        if (!baseGeoRef.current || isGPUInitialised) return;
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
        const baseGeo = baseGeoRef.current;

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

        // create uTime uniform
        particlesVariableRef.current.material.uniforms.uTime = new THREE.Uniform(0);
        particlesVariableRef.current.material.uniforms.uDeltaTime = new THREE.Uniform(0);
        particlesVariableRef.current.material.uniforms.uFlowFieldInfluence = new THREE.Uniform(flowFieldInfluence)
        particlesVariableRef.current.material.uniforms.uFlowFieldStrength = new THREE.Uniform(flowFieldStrength)
        particlesVariableRef.current.material.uniforms.uFlowFieldFrequency = new THREE.Uniform(flowFieldFrequency)

        // send original geometry texture to shader to use as initial value for each particle
        particlesVariableRef.current.material.uniforms.uBasePosition = new THREE.Uniform(baseParticlesTexture)
        // console.log( particlesVariableRef.current.material.uniforms.uBasePosition)
        // initialise the compute
        gpuRef.current.init()


        // the actual geometry for the points
        actualPointsGeoRef.current = new THREE.BufferGeometry() // new empty geometry
        actualPointsGeoRef.current.setDrawRange(0, countPoints) // draws the right number of points all at 0,0
        // not the actual position will be updated in the vertex shader based on the particles texture uniform

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
        // actualPointsGeoRef.current.setAttribute('aColor', new THREE.BufferAttribute(colorsArray, 4));

        actualPointsGeoRef.current.setAttribute('aParticleSize', new THREE.BufferAttribute(particleSizeArray, 1))


        setIsGPUInitialised(true);

    }, [gl, isGPUInitialised])


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

    useEffect(() => {
        if (particlesRef.current && uSize) {
            particlesRef.current.material.uniforms.uSize.value = uSize
        }
    }, [uSize])

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

            // Apply it to your plane's material
            if (planeRef.current) {
                // planeRef.current.geometry.setAttribute('position', new THREE.BufferAttribute(particlesTexture.image.data, 3))
                // geo.setAttribute('position', new THREE.Float32BufferAttribute(updatedPositions[0], 3))

                planeRef.current.material.map = particlesTexture;
                // planeRef.current.material.needsUpdate = true;
            }
            // Pass to particles shader
            if (particlesRef.current) {
                particlesRef.current.material.uniforms.uParticlesTexture.value = particlesTexture;
                // particlesRef.current.geometry.needsUpdate = true;

            }

        }

    })

    return (<>
        <Perf position="top-left" />
        <OrbitControls makeDefault />
        <ambientLight intensity={10} />
        {/* Sets background */}
        <color args={[bgColor]} attach='background' />



        {/* 
        This is out actual render object
        the model is not actually rendering anything just the points geometry 
        */}
        <points
            ref={particlesRef}
            geometry={actualPointsGeoRef.current}
        >
            <myShaderMaterial transparent side={THREE.DoubleSide} />
        </points>


        {/* Plane to visualise gpgpu computation */}
        <mesh
            ref={planeRef}
            position={[2, 0, 0]}
            visible={false}
        >
            <planeGeometry args={[3, 3]} />
            {/* <myShaderMaterial transparent side={THREE.DoubleSide} /> */}
            <meshBasicMaterial side={THREE.DoubleSide} />
        </mesh>



        {/*
            Uses handleGeometryLoad callback to receive Model's geometry
            Stores it in baseGeoRef
            Initialises GPGPU computation when geometry is available
        */}
        <Model visible={false}
            onGeometryLoad={handleGeometryLoad}
        />

    </>
    )
}

export default Experience