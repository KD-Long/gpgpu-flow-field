import React, { useRef } from 'react'
import { Perf } from 'r3f-perf'
import { useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { useControls } from 'leva'
import GPGPU from './GPGPU'
import * as THREE from 'three'
import { TextureLoader } from 'three'

const Experience = () => {

    let { bgColor, uSize, flowFieldInfluence, flowFieldStrength, flowFieldFrequency } = useControls({
        // bgColor: { value: '#1d1f2a', label: 'Background Color' },
        uSize: { value: 0.9, min: 0.01, max: 2.0, step: 0.01 },
        flowFieldInfluence: { value: 0.5, min: 0.0, max: 1.0, step: 0.001 },
        flowFieldStrength: { value: 4, min: 0.0, max: 10.0, step: 0.001 },
        flowFieldFrequency: { value: 0.5, min: 0.0, max: 1.0, step: 0.001 },
    });

    let c1Ref = useRef()
    let c2Ref = useRef()

    // Load asphalt textures for plane
    // https://3dtextures.me/2018/01/21/asphalt-002/
    let [Asphalt_002_COLOR, Asphalt_002_NORM, Asphalt_002_ROUGH, Asphalt_002_DISP, Asphalt_002_OC] = useLoader(TextureLoader, [
        './static/Asphalt/Asphalt_002_COLOR.jpg',
        './static/Asphalt/Asphalt_002_NORM.jpg',
        './static/Asphalt/Asphalt_002_ROUGH.jpg',
        './static/Asphalt/Asphalt_002_DISP.png',
        './static/Asphalt/Asphalt_002_OCC.jpg'
    ])

    // Only COLOR map should be sRGB, others stay linear
    Asphalt_002_COLOR.colorSpace = THREE.SRGBColorSpace
    
    // Tile/repeat the textures for better detail
    const textures = [Asphalt_002_COLOR, Asphalt_002_NORM, Asphalt_002_ROUGH, Asphalt_002_DISP, Asphalt_002_OC]
    textures.forEach(texture => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(5, 5)
    })
    

    useFrame((state, delta) => {
        // console.log(c1Ref.current)
        //rotate around 0,0,0 in a circle with radius 10
        let speed = state.clock.elapsedTime * 1.1

        // rotate cars position around 0,0,0 in a circle with radius 10
        if (c1Ref.current) {
            let angle = speed * 0.5 + Math.PI * 2
            c1Ref.current.rotation.y = angle + Math.PI / 2
            c1Ref.current.position.x = Math.sin(angle) * 10
            c1Ref.current.position.z = Math.cos(angle) * 10
        }
        if (c2Ref.current) {
            let angle = speed * -0.5 + -Math.PI * 2
            c2Ref.current.rotation.y = angle + -Math.PI / 2
            c2Ref.current.position.x = Math.sin(angle) * 10
            c2Ref.current.position.z = Math.cos(angle) * 10
        }
    })

    return (
        <>
            {/* Scene setup */}
            <Perf position="top-left" />
            <OrbitControls makeDefault />
            <ambientLight intensity={10} />
            {/* <color args={[bgColor]} attach='background' /> */}
            <Environment preset='sunset' background blur={0.3}></Environment>


            {/* Boat  */}
            <GPGPU
                position={[-1.05, -.35, 0]}
                modelPath="./static/model.glb"
                particleSize={uSize}
                flowFieldInfluence={flowFieldInfluence}
                flowFieldStrength={flowFieldStrength}
                flowFieldFrequency={flowFieldFrequency}
                planeVisible={false}
            />

            {/* 
            Model Credit:
                https://sketchfab.com/3d-models/1969-chevrolet-corvette-stingray-427-9d2a1eecdd4c4871ab12635829fec7c1
                Author: Sketchfab User @outpiston (https://sketchfab.com/outpiston)
                License: CC Attribution-NonCommercial-ShareAlikeCC Attribution-NonCommercial-ShareAlike

                Year: 1969
                Model: Corvette
                Trim: Stingray
                Body Style: 2-door Coupe
                Class: Sports Car
                Manufacturer: Chevrolet
                -
                Engine: 7.0 Liter L71 V8
                Aspiration: Natural
                Transmission: 4-speed Manual
                Power Output: 435 Horsepower
                Torque: 460 lb-ft
                Drivetrain: Front-engine, Rear Wheel Drive
                -
                Curb Weight: 1,597 kg 
            */}

            {/* Corvette 1 */}
            <GPGPU
                ref={c1Ref}
                position={[0, -1.6, 0]}
                rotation={[0, Math.PI / 2, 0]}
                modelPath="./static/1969_Chevrolet_Corvette_Stingray_427.glb"
                particleSize={uSize}
                flowFieldInfluence={flowFieldInfluence}
                flowFieldStrength={flowFieldStrength}
                flowFieldFrequency={flowFieldFrequency}
                planeVisible={false}
            />

            {/* Corvette 2 */}
            <GPGPU
                ref={c2Ref}
                position={[0, -1.6, 6]}
                rotation={[0, -Math.PI / 2, 0]}
                modelPath="./static/1969_Chevrolet_Corvette_Stingray_427.glb"
                particleSize={uSize}
                flowFieldInfluence={flowFieldInfluence}
                flowFieldStrength={flowFieldStrength}
                flowFieldFrequency={flowFieldFrequency}
                planeVisible={false}
                frustumCulled={false}
            />

            {/* Plane/floor */}
            <mesh
                rotation={[-Math.PI * 0.5, 0, 0]}
                position={[0, -1.6, 0]}
            >
                <planeGeometry args={[40, 40]} />
                <meshStandardMaterial 
                    map={Asphalt_002_COLOR}           // Base color texture
                    normalMap={Asphalt_002_NORM}      // Normal map for surface detail
                    // roughnessMap={Asphalt_002_ROUGH}  // Roughness map
                    displacementMap={Asphalt_002_DISP} // Height/displacement map
                    displacementScale={0.05}           // Subtle displacement
                    aoMap={Asphalt_002_OC}            // Ambient occlusion
                    aoMapIntensity={1}
                    color="#666666"                    // Darken the texture (try #888888 for lighter)
                    side={THREE.DoubleSide} 
                />
            </mesh>

        </>
    )
}

export default Experience
