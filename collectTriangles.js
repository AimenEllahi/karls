import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
  CONTAINED,
  INTERSECTED,
  NOT_INTERSECTED,
  MeshBVHVisualizer,
} from "./src/index.js";
import { parseBufferGeometryToObj } from "./exporter.js";
import { downloadString } from "./functions.js";
import { prepareMesh } from "./prepareMesh.js";

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

//Declare Variables
let exportedModelName,
  originalModel,
  scene,
  camera,
  renderer,
  material,
  controls,
  targetMesh,
  brushMesh,
  brushMaterial,
  brush,
  symmetryBrush,
  bvhHelper,
  lastTime,
  maxSize,
  mouse = new THREE.Vector2(),
  mouseType = -1,
  brushActive = false,
  normalZ = new THREE.Vector3(0, 0, 1),
  lastMouse = new THREE.Vector2(),
  mouseState = false,
  lastMouseState = false,
  lastCastPose = new THREE.Vector3(),
  rightClick = false,
  sculptToggle = false;
let paintColor = {
  r: 199,
  g: 0,
  b: 57,
};
const params = {
  matcap: "Clay",
  size: 10,
  brush: "clay",
  intensity: 0.1,
  maxSteps: 10,
  invert: false,
  symmetrical: false,
  flatShading: false,
  depth: 10,
  displayHelper: false,
};
const matcaps = {};

//Resets Model to its initial
const reset = document.querySelector(".reset");
reset.addEventListener("click", () => {
  if (targetMesh) {
    scene.remove(targetMesh);
    targetMesh.geometry.dispose();
    targetMesh = prepareMesh(originalModel.geometry, material);

    targetMesh.frustumCulled = false;

    scene.add(targetMesh);
  }
});

/**
 * Helper function that behaves like rhino's "zoom to selection", but for three.js!
 */
function zoomCameraToSelection(selection, fitOffset = 1.1) {
  const box = new THREE.Box3();

  box.expandByObject(selection);

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  maxSize = Math.max(size.x, size.y, size.z);
  const fitHeightDistance =
    maxSize / (2 * Math.atan((Math.PI * camera.fov) / 360));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);

  const direction = controls.target
    .clone()
    .sub(camera.position)
    .normalize()
    .multiplyScalar(distance);

  controls.target.copy(center);

  camera.near = 0.1;
  camera.far = 10000;
  camera.updateProjectionMatrix();
  camera.position.copy(controls.target).sub(direction);

  controls.update();
}

//Export Button
const exporter = document.querySelector(".export");
exporter.addEventListener("click", function () {
  const now = new Date();
  const dateAndTime = now.toISOString().replace(/[:.]/g, "-");

  // Combine the model name with the date and time
  exportedModelName = `model_${dateAndTime}.obj`;
  const result = parseBufferGeometryToObj(targetMesh.geometry);
  downloadString(result, exportedModelName);
});
const slider = document.querySelector(".vertical-slider");
const sliderValue = document.querySelector(".slider-value");

slider.addEventListener("input", function () {
  // Get the current value of the slider and update the displayed value
  const value = slider.value;
  sliderValue.textContent = value;
  params.size = sliderValue.textContent;
});

// Add an event listener for intensity slider
const intensitySlider = document.querySelector(".vertical-slider-intensity");
const intensityValue = document.querySelector(".slider-value-intensity");

intensitySlider.addEventListener("input", function () {
  // Get the current value of the slider and update the displayed value
  const value = intensitySlider.value;
  intensityValue.textContent = value;
  params.intensity = value * 0.05;
});

// Add an event listener for color circle clicks
document.querySelectorAll(".circle").forEach(function (circle) {
  circle.addEventListener("click", function (event) {
    const clickedColor = event.target.getAttribute("data-color");
    setBrushColor(clickedColor);
  });
});

const sculptToggleBtn = document.querySelector(".sculpt-toggle");
const colorSelector = document.querySelector(".color-selector");
const brushSelector = document.querySelector(".brush-selector");
sculptToggleBtn.addEventListener("click", function () {
  sculptToggle = !sculptToggle;
  if (sculptToggle) {
    sculptToggleBtn.textContent = "Painting";
    brush.visible = true;
    //remove class
    colorSelector.classList.add("hide");
    brushSelector.classList.remove("hide");
  } else {
    sculptToggleBtn.textContent = "Scultpting";
    brush.visible = false;
    //remove class
    colorSelector.classList.remove("hide");
    brushSelector.classList.add("hide");
  }
});

// Function to set the brush color
function setBrushColor(color) {
  let brushColor;
  switch (color) {
    case "red":
      brushColor = 0xc70039;
      paintColor = {
        r: 199,
        g: 0,
        b: 57,
      };

      break;
    case "blue":
      brushColor = 0x12486b;
      paintColor = {
        r: 18,
        g: 72,
        b: 107,
      };
      break;
    case "green":
      brushColor = 0x618264;
      paintColor = {
        r: 97,
        g: 130,
        b: 100,
      };
      break;
    case "yellow":
      brushColor = 0xf4e869;
      paintColor = {
        r: 244,
        g: 232,
        b: 105,
      };
      break;
    case "orange":
      brushColor = 0xe55604;
      paintColor = {
        r: 229,
        g: 86,
        b: 4,
      };
      break;
    case "white":
      brushColor = 0xffffff;
      paintColor = {
        r: 255,
        g: 255,
        b: 255,
      };
      break;
    default:
      brushColor = 0xc70039;
      paintColor = {
        r: 199,
        g: 0,
        b: 57,
      };
  }

  if (brushMesh && brushMesh.material) {
    brushMesh.material.color = new THREE.Color(brushColor);
    brushMesh.material.emissive = new THREE.Color(brushColor);
  }
}

const modelUploadInput = document.getElementById("modelUpload");

modelUploadInput.addEventListener("change", function (event) {
  const file = event.target.files[0];

  if (file) {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".obj") || fileName.endsWith(".stl")) {
      loadModel(file);
      document.getElementById("modelUpload").value = "";
      document.getElementById("modelUpload").style.display = "none";
    } else {
      alert(
        "Please select a valid 3D model file with .obj, or .stl extension."
      );
    }
  }
});
//loadModelUrl("./public/TestScanFuss.obj", );

function loadModel(file) {
  const fileName = file.name.toLowerCase();
  loadModelUrl(fileName, URL.createObjectURL(file));
}
function loadModelUrl(fileName, url = fileName) {
  let loader;

  if (fileName.endsWith(".obj")) {
    loader = new OBJLoader();

    loader.load(
      url,
      (loadedObject) => {
        if (targetMesh) {
          scene.remove(targetMesh);
          targetMesh.geometry.dispose();
        }

        originalModel = prepareMesh(
          loadedObject.children[0].geometry,
          material
        );
        targetMesh = prepareMesh(loadedObject.children[0].geometry, material);

        zoomCameraToSelection(targetMesh);

        scene.add(targetMesh);

        // initialize bvh helper
        if (!bvhHelper) {
          bvhHelper = new MeshBVHVisualizer(targetMesh, params.depth);
          if (params.displayHelper) {
            scene.add(bvhHelper);
          }
        }

        bvhHelper.mesh = targetMesh;
        bvhHelper.update();
      },
      (xhr) => {
        // This callback will be called while the model isroviding progress information
        console.log("Loading model...", (xhr.loaded / xhr.total) * 100 + "%");
      },
      (error) => {
        // This callback will be called if there's an error during loading
        console.error("Error loading model:", error);
      }
    );
  } else if (fileName.endsWith(".stl")) {
    loader = new STLLoader();
    loader.load(url, (geometry) => {
      targetMesh = prepareMesh(geometry, material);
      targetMesh.frustumCulled = false;

      targetMesh.rotateX(Math.PI * -0.5);
      //targetMesh.rotateZ(Math.PI * -.5)
      //targetMesh.rotateY(Math.PI * .5)

      zoomCameraToSelection(targetMesh);
      scene.add(targetMesh);

      // initialize bvh helper
      if (!bvhHelper) {
        bvhHelper = new MeshBVHVisualizer(targetMesh, params.depth);
        if (params.displayHelper) {
          scene.add(bvhHelper);
        }
      }

      bvhHelper.mesh = targetMesh;
      bvhHelper.update();
    });
  } else {
    alert("Unsupported file format.");
    return;
  }
}

// Run the perform the brush movement
function performStroke(
  point,
  brushObject,
  brushOnly = false,
  accumulatedFields = {}
) {
  const {
    accumulatedTriangles = new Set(),
    accumulatedIndices = new Set(),
    accumulatedTraversedNodeIndices = new Set(),
  } = accumulatedFields;

  const inverseMatrix = new THREE.Matrix4();
  inverseMatrix.copy(targetMesh.matrixWorld).invert();

  const sphere = new THREE.Sphere();
  sphere.center.copy(point).applyMatrix4(inverseMatrix);
  sphere.radius = params.size;

  // Collect the intersected vertices
  const indices = new Set();
  const tempVec = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const indexAttr = targetMesh.geometry.index;
  const posAttr = targetMesh.geometry.attributes.position;
  const normalAttr = targetMesh.geometry.attributes.normal;
  const triangles = new Set();
  const bvh = targetMesh.geometry.boundsTree;
  bvh.shapecast({
    intersectsBounds: (box, isLeaf, score, depth, nodeIndex) => {
      accumulatedTraversedNodeIndices.add(nodeIndex);

      const intersects = sphere.intersectsBox(box);
      const { min, max } = box;
      if (intersects) {
        for (let x = 0; x <= 1; x++) {
          for (let y = 0; y <= 1; y++) {
            for (let z = 0; z <= 1; z++) {
              tempVec.set(
                x === 0 ? min.x : max.x,
                y === 0 ? min.y : max.y,
                z === 0 ? min.z : max.z
              );
              if (!sphere.containsPoint(tempVec)) {
                return INTERSECTED;
              }
            }
          }
        }

        return CONTAINED;
      }

      return intersects ? INTERSECTED : NOT_INTERSECTED;
    },
    intersectsTriangle: (tri, index, contained) => {
      const triIndex = index;
      triangles.add(triIndex);
      accumulatedTriangles.add(triIndex);

      const i3 = 3 * index;
      const a = i3 + 0;
      const b = i3 + 1;
      const c = i3 + 2;
      const va = indexAttr.getX(a);
      const vb = indexAttr.getX(b);
      const vc = indexAttr.getX(c);
      if (contained) {
        indices.add(va);
        indices.add(vb);
        indices.add(vc);

        accumulatedIndices.add(va);
        accumulatedIndices.add(vb);
        accumulatedIndices.add(vc);
      } else {
        if (sphere.containsPoint(tri.a)) {
          indices.add(va);
          accumulatedIndices.add(va);
        }

        if (sphere.containsPoint(tri.b)) {
          indices.add(vb);
          accumulatedIndices.add(vb);
        }

        if (sphere.containsPoint(tri.c)) {
          indices.add(vc);
          accumulatedIndices.add(vc);
        }
      }

      return false;
    },
  });

  // Compute the average normal at this point
  const localPoint = new THREE.Vector3();
  localPoint.copy(point).applyMatrix4(inverseMatrix);

  const planePoint = new THREE.Vector3();
  let totalPoints = 0;
  indices.forEach((index) => {
    tempVec.fromBufferAttribute(normalAttr, index);
    normal.add(tempVec);

    // compute the average point for cases where we need to flatten
    // to the plane.
    if (!brushOnly) {
      totalPoints++;
      tempVec.fromBufferAttribute(posAttr, index);
      planePoint.add(tempVec);
    }
  });
  normal.normalize();
  brushObject.quaternion.setFromUnitVectors(normalZ, normal);

  if (totalPoints) {
    planePoint.multiplyScalar(1 / totalPoints);
  }

  // Early out if we just want to adjust the brush
  if (brushOnly) {
    return;
  }

  // perform vertex adjustment
  const targetHeight = params.intensity;
  const plane = new THREE.Plane();
  plane.setFromNormalAndCoplanarPoint(normal, planePoint);

  indices.forEach((index) => {
    tempVec.fromBufferAttribute(posAttr, index);

    // compute the offset intensity
    const dist = tempVec.distanceTo(localPoint);
    const negated = params.invert !== rightClick ? -1 : 1;
    let intensity = 1.0 - dist / params.size;

    // offset the vertex
    //console.log(params)
    if (params.brush === "clay") {
      intensity = Math.pow(intensity, 3);
      const planeDist = plane.distanceToPoint(tempVec);
      const clampedIntensity = negated * Math.min(intensity * 4, 1.0);
      tempVec.addScaledVector(
        normal,
        clampedIntensity * targetHeight -
          negated * planeDist * clampedIntensity * 0.3
      );
    } else if (params.brush === "normal") {
      intensity = Math.pow(intensity, 2);
      tempVec.addScaledVector(normal, negated * intensity * targetHeight);
    } else if (params.brush === "flatten") {
      intensity = Math.pow(intensity, 2);

      const planeDist = plane.distanceToPoint(tempVec);
      tempVec.addScaledVector(
        normal,
        -planeDist * intensity * params.intensity * 0.01 * 0.5
      );
    }

    posAttr.setXYZ(index, tempVec.x, tempVec.y, tempVec.z);
    normalAttr.setXYZ(index, 0, 0, 0);
  });

  // If we found vertices
  if (indices.size) {
    posAttr.needsUpdate = true;
  }
}

function updateNormals(triangles, indices) {
  const tempVec = new THREE.Vector3();
  const tempVec2 = new THREE.Vector3();
  const indexAttr = targetMesh.geometry.index;
  const posAttr = targetMesh.geometry.attributes.position;
  const normalAttr = targetMesh.geometry.attributes.normal;

  // accumulate the normals in place in the normal buffer
  const triangle = new THREE.Triangle();
  triangles.forEach((tri) => {
    const tri3 = tri * 3;
    const i0 = tri3 + 0;
    const i1 = tri3 + 1;
    const i2 = tri3 + 2;

    const v0 = indexAttr.getX(i0);
    const v1 = indexAttr.getX(i1);
    const v2 = indexAttr.getX(i2);

    triangle.a.fromBufferAttribute(posAttr, v0);
    triangle.b.fromBufferAttribute(posAttr, v1);
    triangle.c.fromBufferAttribute(posAttr, v2);
    triangle.getNormal(tempVec2);

    if (indices.has(v0)) {
      tempVec.fromBufferAttribute(normalAttr, v0);
      tempVec.add(tempVec2);
      normalAttr.setXYZ(v0, tempVec.x, tempVec.y, tempVec.z);
    }

    if (indices.has(v1)) {
      tempVec.fromBufferAttribute(normalAttr, v1);
      tempVec.add(tempVec2);
      normalAttr.setXYZ(v1, tempVec.x, tempVec.y, tempVec.z);
    }

    if (indices.has(v2)) {
      tempVec.fromBufferAttribute(normalAttr, v2);
      tempVec.add(tempVec2);
      normalAttr.setXYZ(v2, tempVec.x, tempVec.y, tempVec.z);
    }
  });

  // normalize the accumulated normals
  indices.forEach((index) => {
    tempVec.fromBufferAttribute(normalAttr, index);
    tempVec.normalize();
    normalAttr.setXYZ(index, tempVec.x, tempVec.y, tempVec.z);
  });

  normalAttr.needsUpdate = true;
}

const init = () => {
  //check if run in iframe
  let parent_iframe =
    window.parent.document.querySelector("iframe")?.parentElement;

  //set bg color grey
  const bgColor = 0xb5b5b5;

  // renderer setup
  renderer = new THREE.WebGLRenderer({
    antialias: true,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(bgColor, 1);
  document.body.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  // scene setup
  scene = new THREE.Scene();
  //scene.fog = new THREE.Fog(0x263238 / 2, 20, 60);

  const light = new THREE.AmbientLight(0xffffff, 1);
  scene.add(light);

  var directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(0, 1000, 0);
  scene.add(directionalLight);

  var directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight2.position.set(1000, 0, 0);
  scene.add(directionalLight2);

  var directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight3.position.set(0, 0, 1000);
  scene.add(directionalLight3);

  var directionalLight4 = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight4.position.set(0, -1000, 0);
  scene.add(directionalLight4);

  var directionalLight5 = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight5.position.set(-1000, 0, 0);
  scene.add(directionalLight5);

  var directionalLight6 = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight6.position.set(0, 0, -1000);
  scene.add(directionalLight6);

  const brushGeometry = new THREE.SphereGeometry(5, 40, 40);
  brushMaterial = new THREE.MeshStandardMaterial({
    color: 0xec407a,
    roughness: 0.75,
    metalness: 0,
    transparent: true,
    opacity: 0.5,
    premultipliedAlpha: true,
    emissive: 0xec407a,
    emissiveIntensity: 0.5,
  });

  brushMesh = new THREE.Mesh(brushGeometry, brushMaterial);

  scene.add(brushMesh);

  // initialize brush cursor
  const brushSegments = [new THREE.Vector3(), new THREE.Vector3(0, 1, 0)];
  for (let i = 0; i < 50; i++) {
    const nexti = i + 1;
    const x1 = Math.sin((2 * Math.PI * i) / 50);
    const y1 = Math.cos((2 * Math.PI * i) / 50);

    const x2 = Math.sin((2 * Math.PI * nexti) / 50);
    const y2 = Math.cos((2 * Math.PI * nexti) / 50);

    brushSegments.push(
      new THREE.Vector3(x1, y1, 0),
      new THREE.Vector3(x2, y2, 0)
    );
  }

  brush = new THREE.LineSegments();
  brush.geometry.setFromPoints(brushSegments);
  brush.material.color.set(0xfb8c00);
  scene.add(brush);
  brush.visible = false;

  symmetryBrush = brush.clone();
  scene.add(symmetryBrush);

  // camera setup
  if (parent_iframe) {
    let parentRect = parent_iframe.getBoundingClientRect();
    camera = new THREE.PerspectiveCamera(
      75,
      parentRect.width / parentRect.height,
      0.1,
      1000
    );
  } else {
    camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
  }
  // init matcaps
  let urls = matcapUrls.forEach(
    (url) =>
      (matcaps[url.slice(0, url.lastIndexOf("."))] =
        new THREE.TextureLoader().load("./public/matcaps/" + url))
  );
  let menu = {};

  for (const key in matcaps) {
    matcaps[key].colorSpace = "srgb";
  }

  //   let mdd = matcapdropdown;
  let str = ``;
  matcapUrls.forEach(
    (url) =>
      (str += `<option value="${url}" style="background-image:url('./public/matcaps/${url}')">${url}</option>\n`)
  );

  let url = "Clay.png";
  params.matcap = url.slice(0, url.lastIndexOf("."));

  //   matcapdropdown.innerHTML = str;
  //   matcapdropdown.onchange = (e) => {
  //     let url = e.target.value;
  //     params.matcap = url.slice(0, url.lastIndexOf("."));
  //   };

  const brushOptions = document.querySelectorAll(".brush-selector img");
  brushOptions.forEach((brushOption) => {
    brushOption.addEventListener("click", (event) => {
      const selectedBrushSrc = event.target.src.split("/").pop(); // Get the last part after the last '/'
      const brushName = selectedBrushSrc.split("_")[0]; // Extract the part before the first '_'
      console.log(brushName);
      params.brush = brushName;
    });
  });

  material = new THREE.MeshMatcapMaterial({
    flatShading: params.flatShading,
    matcap: matcaps["Clay"],
    vertexColors: true,
  });

  if (0)
    material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0,
      vertexColors: true,
      flatShading: params.flatShading,
    });

  camera.position.set(0, 0, 2);
  camera.far = 100;
  camera.updateProjectionMatrix();

  window.addEventListener(
    "resize",
    function () {
      if (parent_iframe) {
        let parentRect = parent_iframe.getBoundingClientRect();

        camera.aspect = parentRect.width / parentRect.height;
        camera.updateProjectionMatrix();
        renderer.setSize(parentRect.width, parentRect.height);
      } else {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
    },
    false
  );

  window.addEventListener("pointermove", function (e) {
    if (parent_iframe) {
      let parentRect = parent_iframe.getBoundingClientRect();
      mouse.x = (e.clientX / parentRect.width) * 2 - 1;
      mouse.y =
        -(e.clientY / parentRect.height) * (parentRect.width < 768 ? 2 : 2) + 1;
    } else {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y =
        -(e.clientY / window.innerHeight) * (window.innerWidth < 768 ? 2 : 2) +
        1;
    }

    brushActive = true;
  });

  window.addEventListener(
    "pointerdown",
    function (e) {
      if (!targetMesh) return;
      if (parent_iframe) {
        let parentRect = parent_iframe.getBoundingClientRect();
        mouse.x = (e.clientX / parentRect.width) * 2 - 1;
        mouse.y =
          -(e.clientY / parentRect.height) * (parentRect.width < 768 ? 2 : 2) +
          1;
      } else {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y =
          -(e.clientY / window.innerHeight) *
            (window.innerWidth < 768 ? 2 : 2) +
          1;
      }

      mouseType = e.button;
      mouseState = Boolean(e.buttons & 3);
      rightClick = Boolean(e.buttons & 2);

      // disable the controls early if we're over the object because on touch screens
      // we're not constantly tracking where the cursor is.
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      raycaster.firstHitOnly = true;

      const res = raycaster.intersectObject(targetMesh, true);

      brushActive = true;
      controls.enabled = res.length === 0;
    },
    true
  );

  window.addEventListener(
    "pointerup",
    function (e) {
      mouseState = Boolean(e.buttons & 3);

      mouseType = -1;
      if (e.pointerType === "touch") {
        // disable the brush visualization when the pointer action is done only
        // if it's on a touch device.
        brushActive = false;
      }
    },
    true
  );

  window.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  controls = new OrbitControls(camera, renderer.domElement);

  controls.addEventListener("start", function () {
    this.active = true;
  });

  controls.addEventListener("end", function () {
    this.active = false;
  });

  lastTime = window.performance.now();
};
const paint = () => {
  const geometry = targetMesh.geometry;
  const bvh = geometry.boundsTree;
  const colorAttr = geometry.getAttribute("color");
  const indexAttr = geometry.index;

  if (controls.active || !brushActive) {
    brushMesh.visible = false;
  } else {
    let bscale = 0.13;
    brushMesh.scale.setScalar(params.size * 0.13);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    raycaster.firstHitOnly = true;

    const res = raycaster.intersectObject(targetMesh, true);
    if (res.length) {
      brushMesh.position.copy(res[0].point);
      controls.enabled = false;
      brushMesh.visible = true;

      const inverseMatrix = new THREE.Matrix4();
      inverseMatrix.copy(targetMesh.matrixWorld).invert();

      const sphere = new THREE.Sphere();
      sphere.center.copy(brushMesh.position).applyMatrix4(inverseMatrix);
      sphere.radius = params.size / 2;

      const indices = [];
      const tempVec = new THREE.Vector3();
      bvh.shapecast({
        intersectsBounds: (box) => {
          const intersects = sphere.intersectsBox(box);
          const { min, max } = box;
          if (intersects) {
            for (let x = 0; x <= 1; x++) {
              for (let y = 0; y <= 1; y++) {
                for (let z = 0; z <= 1; z++) {
                  tempVec.set(
                    x === 0 ? min.x : max.x,
                    y === 0 ? min.y : max.y,
                    z === 0 ? min.z : max.z
                  );
                  if (!sphere.containsPoint(tempVec)) {
                    return INTERSECTED;
                  }
                }
              }
            }

            return CONTAINED;
          }

          return intersects ? INTERSECTED : NOT_INTERSECTED;
        },
        intersectsTriangle: (tri, i, contained) => {
          if (contained || tri.intersectsSphere(sphere)) {
            const i3 = 3 * i;
            indices.push(i3, i3 + 1, i3 + 2);
          }

          return false;
        },
      });

      if (mouseType === 0 || mouseType === 2) {
        let r = 1,
          g = 1,
          b = 1;
        if (mouseType === 0) {
          r = paintColor.r / 255;
          g = paintColor.g / 255;
          b = paintColor.b / 255;
        }

        for (let i = 0, l = indices.length; i < l; i++) {
          const i2 = indexAttr.getX(indices[i]);
          colorAttr.setX(i2, r);
          colorAttr.setY(i2, g);
          colorAttr.setZ(i2, b);
        }

        colorAttr.needsUpdate = true;
      }
    } else {
      controls.enabled = true;
      brushMesh.visible = false;
    }
  }

  const currTime = window.performance.now();

  lastTime = currTime;
};
const sculpt = () => {
  material.matcap = matcaps[params.matcap];

  if (controls.active || !brushActive) {
    // If the controls are being used then don't perform the strokes
    brush.visible = false;
    symmetryBrush.visible = false;
    lastCastPose.setScalar(Infinity);
  } else {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    raycaster.firstHitOnly = true;

    const hit = raycaster.intersectObject(targetMesh, true)[0];
    // if we hit the target mesh
    if (hit) {
      brush.visible = true;
      brush.scale.set(params.size, params.size, 0.1);
      brush.position.copy(hit.point);

      symmetryBrush.visible = params.symmetrical;
      symmetryBrush.scale.set(params.size, params.size, 0.1);
      symmetryBrush.position.copy(hit.point);
      symmetryBrush.position.x *= -1;

      controls.enabled = false;

      // if the last cast pose was missed in the last frame then set it to
      // the current point so we don't streak across the surface
      if (lastCastPose.x === Infinity) {
        lastCastPose.copy(hit.point);
      }

      // If the mouse isn't pressed don't perform the stroke
      if (!(mouseState || lastMouseState)) {
        performStroke(hit.point, brush, true);
        if (params.symmetrical) {
          hit.point.x *= -1;
          performStroke(hit.point, symmetryBrush, true);
          hit.point.x *= -1;
        }

        lastMouse.copy(mouse);
        lastCastPose.copy(hit.point);
      } else {
        // compute the distance the mouse moved and that the cast point moved
        const mdx =
          (mouse.x - lastMouse.x) * window.innerWidth * window.devicePixelRatio;
        const mdy =
          (mouse.y - lastMouse.y) *
          window.innerHeight *
          window.devicePixelRatio;
        let mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        let castDist = hit.point.distanceTo(lastCastPose);

        const step = params.size * 0.15;
        const percent = Math.max(step / castDist, 1 / params.maxSteps);
        const mstep = mdist * percent;
        let stepCount = 0;

        // perform multiple iterations toward the current mouse pose for a consistent stroke
        // TODO: recast here so he cursor is on the surface of the model which requires faster
        // refitting of the model
        const changedTriangles = new Set();
        const changedIndices = new Set();
        const traversedNodeIndices = new Set();
        const sets = {
          accumulatedTriangles: changedTriangles,
          accumulatedIndices: changedIndices,
          accumulatedTraversedNodeIndices: traversedNodeIndices,
        };
        while (castDist > step && mdist > (params.size * 200) / hit.distance) {
          lastMouse.lerp(mouse, percent);
          lastCastPose.lerp(hit.point, percent);
          castDist -= step;
          mdist -= mstep;

          performStroke(lastCastPose, brush, false, sets);

          if (params.symmetrical) {
            lastCastPose.x *= -1;
            performStroke(lastCastPose, symmetryBrush, false, sets);
            lastCastPose.x *= -1;
          }

          stepCount++;
          if (stepCount > params.maxSteps) {
            break;
          }
        }

        // refit the bounds and update the normals if we adjusted the mesh
        if (stepCount > 0) {
          // refit bounds and normal updates could happen after every stroke
          // so it's up to date for the next one because both of those are used when updating
          // the model but it's faster to do them here.
          updateNormals(changedTriangles, changedIndices);
          targetMesh.geometry.boundsTree.refit(traversedNodeIndices);

          if (bvhHelper.parent !== null) {
            bvhHelper.update();
          }
        } else {
          performStroke(hit.point, brush, true);
          if (params.symmetrical) {
            hit.point.x *= -1;
            performStroke(hit.point, symmetryBrush, true);
            hit.point.x *= -1;
          }
        }
      }
    } else {
      // if we didn't hit
      controls.enabled = true;
      brush.visible = false;
      symmetryBrush.visible = false;
      lastMouse.copy(mouse);
      lastCastPose.setScalar(Infinity);
    }
  }

  lastMouseState = mouseState;
};
const render = () => {
  requestAnimationFrame(render);

  if (targetMesh) {
    if (sculptToggle) {
      sculpt();
    } else {
      paint();
    }
  }
  //traverse

  renderer.render(scene, camera);
};
let matcapUrls = `AtmosphericGlowMatcap.png
BazC_SkinMat.jpg
Clay.png
JG_Gold.png
JG_Red.png
Metal-1.png
Metal-2.png
Normal.png
RedWax.png
ReflectedMap2.png
ShinyGreen.png
ShinyMatcap.png
Shiny_Fire_1c.png
SlateGreyMatcap.png
White_Cavity.png
material3.jpg
silver.jpg
softunderlight.png
test_gold.jpg
test_steel.jpg`.split("\n");
init();
render();
