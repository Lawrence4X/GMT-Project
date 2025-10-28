// main.js - loads GLTF, adds raycast click selection, shows attributes
(function () {
  // Adjust modelPath if you store the GLTF elsewhere.
  const modelPath = encodeURI("C:\Users\Lawrence\OneDrive - University of Pretoria\Documents\GMT 320\Model VS code\Model files-20251028T091952Z-1-001\Model files\Lawrence Model.gltf");

  // basic three.js setup
  const container = document.getElementById("canvasHolder");
  const width = container.clientWidth, height = container.clientHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 10000);
  camera.up.set(0, 0, 1);

  // lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(-1, -1, 2);
  scene.add(dir);

  // controls
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // helpers
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // selection highlight
  let highlightMesh = null;
  const highlightMaterial = new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: 0x553300, transparent: true, opacity: 0.5, side: THREE.DoubleSide });

  // UI elements
  const infoPanel = document.getElementById("infoPanel");
  const attrsDiv = document.getElementById("attrs");
  const infoTitle = document.getElementById("infoTitle");
  const closeInfo = document.getElementById("closeInfo");
  const zoomBtn = document.getElementById("zoomBtn");
  const clearSelection = document.getElementById("clearSelection");
  const loaderProgress = document.getElementById("loaderProgress");

  closeInfo.addEventListener("click", () => { clearSelectionFn(); });
  clearSelection.addEventListener("click", () => { clearSelectionFn(); });

  // load model
  const loadingManager = new THREE.LoadingManager();
  loadingManager.onProgress = function (item, loaded, total) {
    loaderProgress.style.width = (loaded / total * 100) + "%";
  };
  loadingManager.onLoad = function () {
    setTimeout(()=> loaderProgress.style.width = "100%", 80);
    setTimeout(()=> loaderProgress.style.width = "0%", 700);
  };

  const gltfLoader = new THREE.GLTFLoader(loadingManager);

  gltfLoader.load(modelPath, function (gltf) {
    // add model to scene
    const root = gltf.scene || gltf.scenes[0];
    scene.add(root);

    // Ensure geometry casts/receives light and are raycastable
    root.traverse(function (node) {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        // If your GLTF has attributes stored in extras, copy them to userData.properties
        if (!node.userData) node.userData = {};
        if (!node.userData.properties && node.userData.extras) {
          node.userData.properties = node.userData.extras;
        }
      }
    });

    // compute bounding box and position camera nicely
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraDist = Math.abs(maxDim / (2 * Math.tan(fov / 2)));
    cameraDist *= 1.5; // padding

    camera.position.set(center.x + cameraDist, center.y + cameraDist, center.z + cameraDist * 0.6);
    controls.target.copy(center);
    camera.lookAt(center);

    render();
  }, undefined, function (err) {
    console.error("Failed to load model:", err);
    alert("Failed to load GLTF model. Check console. Path used: " + modelPath);
  });

  // resize handling
  window.addEventListener("resize", onWindowResize);
  function onWindowResize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    render();
  }

  // render loop
  function render() {
    controls.update();
    renderer.render(scene, camera);
  }
  (function animate() {
    requestAnimationFrame(animate);
    render();
  })();

  // click -> pick
  renderer.domElement.addEventListener("click", function (ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = - ((ev.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    // limit to visible meshes only
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
      let picked = null;
      for (let i=0;i<intersects.length;i++){
        if (intersects[i].object && intersects[i].object.isMesh) { picked = intersects[i].object; break; }
      }
      if (picked) {
        showAttributesFor(picked, intersects[0].point);
      } else {
        clearSelectionFn();
      }
    } else {
      clearSelectionFn();
    }
  });

  // display attributes
  function showAttributesFor(mesh, point) {
    // remove old highlight
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }

    // clone geometry for highlight overlay
    try {
      highlightMesh = mesh.clone();
      // ensure a single material for highlight
      highlightMesh.traverse(n => { if (n.isMesh) n.material = highlightMaterial; });

      // place highlight in same parent coordinate frame as original
      // sometimes cloning keeps transform; add to scene in the same world position
      highlightMesh.position.copy(mesh.getWorldPosition(new THREE.Vector3()));
      highlightMesh.quaternion.copy(mesh.getWorldQuaternion(new THREE.Quaternion()));
      highlightMesh.scale.copy(mesh.getWorldScale(new THREE.Vector3()));
      scene.add(highlightMesh);
    } catch (e) {
      console.warn("Could not create highlight clone:", e);
    }

    // populate info panel
    infoTitle.textContent = mesh.name || (mesh.userData && mesh.userData.id) || "Object";
    attrsDiv.innerHTML = "";

    // choose properties to show
    const props = (mesh.userData && mesh.userData.properties) ? mesh.userData.properties : mesh.userData || {};

    // if props is an object, show key-value pairs
    if (typeof props === "object" && Object.keys(props).length) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        const row = document.createElement("div");
        row.className = "attrRow";
        row.innerHTML = `<div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(String(v))}</div>`;
        attrsDiv.appendChild(row);
      }
    } else {
      // fallback: show basic metadata
      const metaItems = [
        ["Mesh name", mesh.name || ""],
        ["Material", mesh.material ? (mesh.material.name || mesh.material.type) : "—"],
        ["Vertices", mesh.geometry ? (mesh.geometry.attributes && mesh.geometry.attributes.position ? mesh.geometry.attributes.position.count : "—") : "—"]
      ];
      metaItems.forEach(([k,v])=>{
        const row = document.createElement("div");
        row.className = "attrRow";
        row.innerHTML = `<div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(String(v))}</div>`;
        attrsDiv.appendChild(row);
      });
    }

    infoPanel.classList.remove("hidden");

    // zoom button centers view onto picked point (if provided)
    zoomBtn.onclick = function () {
      if (point) {
        controls.target.copy(point);
        camera.position.copy(point.clone().add(new THREE.Vector3(0.8, -1.0, 0.6).multiplyScalar( Math.max(camera.position.distanceTo(point) * 0.3, 1) )));
        render();
      }
    };
  }

  function clearSelectionFn() {
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    infoPanel.classList.add("hidden");
    attrsDiv.innerHTML = "";
  }

  // search functionality (find first mesh whose name contains input)
  const searchBox = document.getElementById("searchBox");
  const searchBtn = document.getElementById("searchBtn");
  searchBtn.addEventListener("click", doSearch);
  searchBox.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

  function doSearch() {
    const q = (searchBox.value || "").trim().toLowerCase();
    if (!q) return;
    let found = null;
    scene.traverse(function (node) {
      if (found) return;
      if (node.isMesh && node.name && node.name.toLowerCase().includes(q)) {
        found = node;
      }
    });
    if (found) {
      // show attributes and move camera
      const box = new THREE.Box3().setFromObject(found);
      const center = box.getCenter(new THREE.Vector3());
      controls.target.copy(center);
      camera.position.copy(center.clone().add(new THREE.Vector3(1, -1, 0.5).multiplyScalar(Math.max(box.getSize(new THREE.Vector3()).length(), 1))));
      showAttributesFor(found, center);
      render();
    } else {
      alert("No object matching: " + q);
    }
  }

  // small helper
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (m) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m];
    });
  }
})();
