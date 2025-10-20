import React, { useRef, useMemo } from 'react'
import { extend, useFrame } from '@react-three/fiber';
import { Perf } from 'r3f-perf'


import { shaderMaterial, useTexture, OrbitControls } from '@react-three/drei';

import { useControls } from 'leva'
import * as THREE from 'three'

import vertexShader from '../shaders/particles/vertex.glsl'
import fragmentShader from '../shaders/particles/fragment.glsl'

const Experience = () => {

    const particlesRef = useRef()

    let { bgColor, uSize } = useControls({
        bgColor: { value: '#1d1f2a', label: 'Background Color' },
        // color1: { value: '#89ff00', label: 'color1' },
        // color2: { value: '#0000ff', label: 'color2' },
        // progress: { value: 0.0, min: 0.0, max: 1.0, step: 0.01 },
        uSize: { value: 1.0, min: 0.1, max: 3.0, step: 0.01 }

    });

    let pointsGeo = useMemo(() => {

        let geo = new THREE.SphereGeometry(2)

        return geo
    }, [])

    const MyShaderMaterial = shaderMaterial({
        uTime: 0,
        uSize: uSize,
        uResolution: new THREE.Vector2(100, 100),

    },
        vertexShader,
        fragmentShader
    )
    //this exent allows it to be used a a component below
    // Note: When using "extend" which register custom components with the JSX reconciler, 
    // use lowercase names for those components, regardless of how they are initially defined.
    extend({ MyShaderMaterial: MyShaderMaterial })

    useFrame((state, delta) => {

        const elapsedTime = state.clock.elapsedTime

        // sphereRef.current.rotation.x = - elapsedTime * 0.1
        // sphereRef.current.rotation.y = elapsedTime * 0.5

        // update utime
        // sphereRef.current.material.uniforms.uTime.value = elapsedTime

        // update color shader with color picker from useControls
        // this is not efficient need to find a better way to update shader when leva controls change
        if(particlesRef.current && uSize){
            console.log(particlesRef.current)
            particlesRef.current.material.uniforms.uSize.value = uSize
        }
        // sphereRef.current.material.uniforms.uColor.value= new THREE.Color(holoColor)

        // state.camera.lookAt(0, 0, 0);
    })

    return (<>
        <Perf position="top-left" />
        <OrbitControls makeDefault />
        {/* Sets background */}
        <color args={[bgColor]} attach='background' />



        <points
            ref={particlesRef}
            geometry={pointsGeo}
        >
            <myShaderMaterial transparent side={THREE.DoubleSide} />
        </points>


        {/* <mesh
            ref={sphereRef}
            position={[0, 0, 0]}
        >
            <sphereGeometry args={[2, 64, 64]} />

            <myShaderMaterial transparent side={THREE.DoubleSide} />
        </mesh> */}

    </>
    )
}

export default Experience