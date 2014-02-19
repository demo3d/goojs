define([
	'goo/particles/ParticleUtils',
	'goo/math/Vector',
	'goo/math/Vector3',
	'goo/math/Vector4',
	'goo/renderer/MeshData'
],
/** @lends */
function (
	ParticleUtils,
	Vector,
	Vector3,
	Vector4,
	MeshData
) {
	'use strict';

	var calcVec = new Vector3();

	/**
	 * @class Data object tracking a single particle in a particle component
	 */
	function Particle(particleComponent, index) {
		this.alive = false;
		this.position = new Vector3();
		this.velocity = new Vector3();
		this.lifeSpan = 0;
		this.parent = particleComponent;
		this.age = 0;
		this.index = index;
		this.color = new Vector4(1, 0, 0, 1);
		this.size = 0.0;
		this.spin = 0.0;
		this.mass = 1.0;
		this.emitter = null;
		this.uvIndex = 0;
		this.lastUVIndex = -1;
		this.bbX = new Vector3();
		this.bbY = new Vector3();
		this.lastColor = new Vector4();
	}

	/**
	 * Called by the particle system to 'respawn' this particle
	 * @private
	 * @param emitter
	 */
	Particle.prototype.respawnParticle = function (emitter) {
		this.emitter = emitter;
		this.lifeSpan = emitter.nextParticleLifeSpan();
		this.alive = true;
		this.age = 0;
	};

	/**
	 * Called by the particle system each frame to update the position and other properties of the particle
	 * @private
	 * @param tpf
	 * @param particleEntity
	 */
	Particle.prototype.update = function (tpf, particleEntity) {
		if (!this.alive) {
			return;
		}

		this.age += tpf;

		if (this.age > this.lifeSpan) {
			this.kill();
			return;
		}

		this.position.add_d(this.velocity.x * tpf, this.velocity.y * tpf, this.velocity.z * tpf);

		// set values from component timeline
		ParticleUtils.applyTimeline(this, this.emitter && this.emitter.timeline ? this.emitter.timeline : this.parent.timeline);

		// apply current color to mesh
		if (!Vector.equals(this.lastColor, this.color)) {
			var colorBuffer = this.parent.meshData.getAttributeBuffer(MeshData.COLOR);
			colorBuffer.set(this.color.data, this.index * 16 + 0);
			colorBuffer.set(this.color.data, this.index * 16 + 4);
			colorBuffer.set(this.color.data, this.index * 16 + 8);
			colorBuffer.set(this.color.data, this.index * 16 + 12);
			this.lastColor.setv(this.color);
		}

		// determine our particle plane
		if (this.emitter) {
			this.emitter.getParticleBillboardVectors(this, particleEntity);
		}
		if (this.spin === 0) {
			this.bbX.muld(this.size, this.size, this.size);
			this.bbY.muld(this.size, this.size, this.size);
		} else {
			var cA = Math.cos(this.spin) * this.size;
			var sA = Math.sin(this.spin) * this.size;
			var upX = this.bbY.x, upY = this.bbY.y, upZ = this.bbY.z;
			this.bbY.setv(this.bbX);
			this.bbX.muld(cA, cA, cA).add_d(upX * sA, upY * sA, upZ * sA);
			this.bbY.muld(-sA, -sA, -sA).add_d(upX * cA, upY * cA, upZ * cA);
		}

		// apply billboard vectors to mesh verts
		var vertexBuffer = this.parent.meshData.getAttributeBuffer(MeshData.POSITION);

		// bottom right point
		Vector3.subv(this.position, this.bbX, calcVec).subv(this.bbY);
		vertexBuffer.set(calcVec.data, this.index * 12 + 0);

		// top right point
		Vector3.subv(this.position, this.bbX, calcVec).addv(this.bbY);
		vertexBuffer.set(calcVec.data, this.index * 12 + 3);

		// top left point
		Vector3.addv(this.position, this.bbX, calcVec).addv(this.bbY);
		vertexBuffer.set(calcVec.data, this.index * 12 + 6);

		// bottom left corner
		Vector3.addv(this.position, this.bbX, calcVec).subv(this.bbY);
		vertexBuffer.set(calcVec.data, this.index * 12 + 9);

		if (this.lastUVIndex !== this.uvIndex) {
			var uvBuffer = this.parent.meshData.getAttributeBuffer(MeshData.TEXCOORD0);
			var uIndex = (this.uvIndex % this.parent.uRange) / this.parent.uRange;
			var vIndex = 1.0 - (Math.floor(this.uvIndex / this.parent.vRange) / this.parent.vRange);
			var uDelta = 1.0 / this.parent.uRange;
			var vDelta = 1.0 / this.parent.vRange;
			uvBuffer.set([uIndex + uDelta, vIndex - vDelta], this.index * 8 + 0);
			uvBuffer.set([uIndex + uDelta, vIndex], this.index * 8 + 2);
			uvBuffer.set([uIndex, vIndex], this.index * 8 + 4);
			uvBuffer.set([uIndex, vIndex - vDelta], this.index * 8 + 6);
			this.lastUVIndex = this.uvIndex;
		}
	};

	/**
	 * Called by update to mark this particle as dead/reusable
	 * @private
	 */
	Particle.prototype.kill = function () {
		this.alive = false;
		// collapse particle to a single point, effectively hiding it from view.
		var vertexBuffer = this.parent.meshData.getAttributeBuffer(MeshData.POSITION);
		var pointA = vertexBuffer.subarray(this.index * 12, this.index * 12 + 3);
		vertexBuffer.set(pointA, this.index * 12 + 3);
		vertexBuffer.set(pointA, this.index * 12 + 6);
		vertexBuffer.set(pointA, this.index * 12 + 9);
	};

	return Particle;
});