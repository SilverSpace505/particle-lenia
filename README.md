**Particle Lenia**

A variant of particle lenia that runs in the browser while using WebGPU to render gravity fields.

The particles become the field values, and growth functions are based entirely off comparing the particle distances to each other with the kernels.

The simulation itself has support for multiple channels and kernel rings of varying sizes.

To optimise performance, on both the CPU and GPU, the particles are placed into chunks.

UI Plan
<img width="1440" height="559" alt="image" src="https://github.com/user-attachments/assets/cba3cf3e-cf67-41cc-a06f-db953f3496d1" />

Other random plans
<img width="921" height="438" alt="image" src="https://github.com/user-attachments/assets/db480aa3-09ba-47fa-bccd-edec49757db0" />
