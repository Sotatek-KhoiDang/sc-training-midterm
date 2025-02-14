import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

async function deployVotingFixture() {
  const [owner, voter1, voter2, candidate1, candidate2] = await hre.ethers.getSigners();
  
  const Token = await hre.ethers.getContractFactory("VotingToken");
  const token = await Token.deploy();
  await token.waitForDeployment();


  const requiredTokenBalance =1000 ;

  const Voting = await hre.ethers.getContractFactory("DecentralizedVoting");
  const voting = await Voting.deploy(token.target, requiredTokenBalance);
  await voting.waitForDeployment();

  return { voting, token, owner, voter1, voter2, candidate1, candidate2, requiredTokenBalance };
}

describe("DecentralizedVoting", function () {
  describe("Deployment", function () {
    it("Should set the correct token address and required token balance", async function () {
      const { voting, token, requiredTokenBalance } = await loadFixture(deployVotingFixture);
      expect(await voting.token()).to.equal(token.target);
      expect(await voting.requiredTokenBalance()).to.equal(requiredTokenBalance);
    });
  });

  describe("Registration", function () {
    it("Should allow a user to register if they have enough tokens", async function () {
      const { voting, token, voter1, requiredTokenBalance } = await loadFixture(deployVotingFixture);

      await token.mint(voter1.address, requiredTokenBalance);
      await token.connect(voter1).approve(voting.target, requiredTokenBalance);
      await expect(voting.connect(voter1).register()).not.to.be.reverted;
    });

    it("Should revert if a user does not have enough tokens", async function () {
      const { voting, voter1 } = await loadFixture(deployVotingFixture);
      await expect(voting.connect(voter1).register()).to.be.revertedWith("Insufficient token balance to register");
    });
  });

  describe("Election Creation", function () {
    it("Should allow the owner to create an election", async function () {
      const { voting, owner, candidate1, candidate2 } = await loadFixture(deployVotingFixture);
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;

      await expect(voting.createElection("Election1", ["Candidate1", "Candidate2"], [candidate1.address, candidate2.address], startTime, endTime))
        .to.emit(voting, "ElectionCreated");
    });

    it("Should revert if a non-owner tries to create an election", async function () {
      const { voting, voter1, candidate1, candidate2 } = await loadFixture(deployVotingFixture);
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;

      await expect(voting.connect(voter1).createElection("Election1", ["Candidate1", "Candidate2"], [candidate1.address, candidate2.address], startTime, endTime))
        .to.be.reverted;
    });
  });

  describe("Voting", function () {
    it("Should allow a registered voter to vote", async function () {
      const { voting, token, voter1, candidate1, candidate2, requiredTokenBalance } = await loadFixture(deployVotingFixture);
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;

      await voting.createElection("Election1", ["Candidate1", "Candidate2"], [candidate1.address, candidate2.address], startTime, endTime);
      await time.increaseTo(startTime);
      
      await token.mint(voter1.address, requiredTokenBalance);
      await token.connect(voter1).approve(voting.target, requiredTokenBalance);
      await voting.connect(voter1).register();

      await expect(voting.connect(voter1).vote(0, 0))
        .to.emit(voting, "VoteCast")
        .withArgs(0, voter1.address, 0);
    });

    it("Should revert if a voter votes twice", async function () {
      const { voting, token, voter1, candidate1, candidate2, requiredTokenBalance } = await loadFixture(deployVotingFixture);
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;

      await voting.createElection("Election1", ["Candidate1", "Candidate2"], [candidate1.address, candidate2.address], startTime, endTime);
      await time.increaseTo(startTime);
      
      await token.mint(voter1.address, requiredTokenBalance);
      await token.connect(voter1).approve(voting.target, requiredTokenBalance);
      await voting.connect(voter1).register();
      
      await voting.connect(voter1).vote(0, 0);
      await expect(voting.connect(voter1).vote(0, 1)).to.be.revertedWith("You have already voted");
    });
  });

  describe("Finalization", function () {
    it("Should allow the owner to finalize an election after it ends", async function () {
      const { voting, candidate1, candidate2 } = await loadFixture(deployVotingFixture);
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;

      await voting.createElection("Election1", ["Candidate1", "Candidate2"], [candidate1.address, candidate2.address], startTime, endTime);
      await time.increaseTo(endTime + 1);

      await expect(voting.finalizeElection(0))
        .to.emit(voting, "ElectionFinalized")
        .withArgs(0);
    });

    it("Should revert if trying to finalize before the election ends", async function () {
      const { voting, candidate1, candidate2 } = await loadFixture(deployVotingFixture);
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;

      await voting.createElection("Election1", ["Candidate1", "Candidate2"], [candidate1.address, candidate2.address], startTime, endTime);

      await expect(voting.finalizeElection(0)).to.be.revertedWith("Election is still ongoing");
    });
  });
});
