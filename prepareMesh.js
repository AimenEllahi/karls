import*as THREE from "three";
import*as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
export const prepareMesh = (geo,material)=>{

    // //LEG FIXUP
    // geo.rotateX(Math.PI * .5)
    // geo.rotateZ(Math.PI * -.5)
    // geo.computeBoundingBox();
    // let size = geo.boundingBox.getSize(new THREE.Vector3());
    // let msize = Math.max(size.x, Math.max(size.y, size.z));
    // geo.scale(1.5 / msize, 1.5 / msize, 1.5 / msize);
    // geo.rotateX(Math.PI * -.5)
    // //LEG FIXUP

    // geo.center();
    // geo.computeBoundsTree();
    // geo.computeBoundingSphere();
    // geo.computeVertexNormals();
    // // Scale mesh so it fits in a 2x2x2 box
    // geo.computeBoundingBox();
    // const box = geo.boundingBox;
    // let dim = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z, ];
    // let maxDim = Math.max(...dim);
    // let scale = 2 / maxDim;

    // // Position mesh into the center of the scene
    // let pos = [((-box.min.x - dim[0] / 2) * 2) / maxDim, ((-box.min.y - dim[1] / 2) * 2) / maxDim, ((-box.min.z - dim[2] / 2) * 2) / maxDim, ];

    let mesh = new THREE.Mesh(geo,material);

    //  mesh.geometry = geo;
    //  mesh.material = material;

    const colorArray = new Uint8Array(geo.attributes.position.count * 3);
    colorArray.fill(255);

    const colorAttr = new THREE.BufferAttribute(colorArray,3,true);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    mesh.geometry.setAttribute("color", colorAttr);
    mesh.geometry.deleteAttribute("uv");
    mesh.geometry.deleteAttribute("normal");
    mesh.geometry = BufferGeometryUtils.mergeVertices(mesh.geometry);
    mesh.geometry.computeVertexNormals();
    mesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    mesh.geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    mesh.geometry.computeBoundsTree({
        setBoundingBox: false
    });
    // mesh.position.set(pos[0], pos[1], pos[2]);
    // mesh.scale.set(scale, scale, scale);

    return mesh;
}
;
