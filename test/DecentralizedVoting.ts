import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

async function deployVotingFixture() {
  const [owner, voter1, voter2, candidate1, candidate2] =
    await hre.ethers.getSigners();

  const Token = await hre.ethers.getContractFactory("VotingToken");

  const token = await Token.deploy();
  await token.waitForDeployment();

  const Vesting = await hre.ethers.getContractFactory("TokenVesting");
  const vesting = await Vesting.deploy(token.target);
  await vesting.waitForDeployment();

  const requiredTokenBalance = 1000;

  const Voting = await hre.ethers.getContractFactory("DecentralizedVoting");
  const voting = await Voting.deploy(
    token.target,
    vesting.target,
    requiredTokenBalance
  );
  await voting.waitForDeployment();

  return {
    voting,
    token,
    vesting,
    owner,
    voter1,
    voter2,
    candidate1,
    candidate2,
    requiredTokenBalance,
  };
}

describe("DecentralizedVoting", function () {
  describe("Deployment", function () {
    it("Should set the correct token address and required token balance", async function () {
      const { voting, token, requiredTokenBalance } = await loadFixture(
        deployVotingFixture
      );
      expect(await voting.token()).to.equal(token.target);
      expect(await voting.requiredTokenBalance()).to.equal(
        requiredTokenBalance
      );
    });
  });

  describe("Registration", function () {
    it("Should allow a user to register if they have enough tokens", async function () {
      const { voting, token, voter1, requiredTokenBalance } = await loadFixture(
        deployVotingFixture
      );

      await token.mint(voter1.address, requiredTokenBalance);
      await expect(voting.connect(voter1).register()).not.to.be.reverted;
    });

    it("Should revert if a user does not have enough tokens", async function () {
      const { voting, voter1 } = await loadFixture(deployVotingFixture);
      await expect(voting.connect(voter1).register()).to.be.revertedWith(
        "Insufficient token balance to register"
      );
    });
  });

  describe("Election Creation", function () {
    it("Should allow the owner to create an election", async function () {
      const { voting, owner, candidate1, candidate2 } = await loadFixture(
        deployVotingFixture
      );
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;

      await expect(
        voting.createElection(
          "Election1",
          ["Candidate1", "Candidate2"],
          [candidate1.address, candidate2.address],
          startTime,
          endTime
        )
      ).to.emit(voting, "ElectionCreated");
    });

    it("Should revert if a non-owner tries to create an election", async function () {
      const { voting, voter1, candidate1, candidate2 } = await loadFixture(
        deployVotingFixture
      );
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;

      await expect(
        voting
          .connect(voter1)
          .createElection(
            "Election1",
            ["Candidate1", "Candidate2"],
            [candidate1.address, candidate2.address],
            startTime,
            endTime
          )
      ).to.be.reverted;
    });
  });

  describe("Voting", function () {
    it("Should allow a registered voter to vote", async function () {
      const {
        voting,
        token,
        voter1,
        candidate1,
        candidate2,
        requiredTokenBalance,
      } = await loadFixture(deployVotingFixture);
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;

      await voting.createElection(
        "Election1",
        ["Candidate1", "Candidate2"],
        [candidate1.address, candidate2.address],
        startTime,
        endTime
      );
      await time.increaseTo(startTime);

      await token.mint(voter1.address, requiredTokenBalance);
      await voting.connect(voter1).register();

      await expect(voting.connect(voter1).vote(0, 0))
        .to.emit(voting, "VoteCast")
        .withArgs(0, voter1.address, 0);
    });

    it("Should revert if a voter votes twice", async function () {
      const {
        voting,
        token,
        voter1,
        candidate1,
        candidate2,
        requiredTokenBalance,
      } = await loadFixture(deployVotingFixture);
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;

      await voting.createElection(
        "Election1",
        ["Candidate1", "Candidate2"],
        [candidate1.address, candidate2.address],
        startTime,
        endTime
      );
      await time.increaseTo(startTime);

      await token.mint(voter1.address, requiredTokenBalance);
      await voting.connect(voter1).register();

      await voting.connect(voter1).vote(0, 0);
      await expect(voting.connect(voter1).vote(0, 1)).to.be.revertedWith(
        "You have already voted"
      );
    });
  });

  describe("Finalization", function () {
    it("Should allow the owner to finalize an election after it ends", async function () {
      const { voting, candidate1, candidate2 } = await loadFixture(
        deployVotingFixture
      );
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;

      await voting.createElection(
        "Election1",
        ["Candidate1", "Candidate2"],
        [candidate1.address, candidate2.address],
        startTime,
        endTime
      );
      await time.increaseTo(endTime + 1);

      await expect(voting.finalizeElection(0))
        .to.emit(voting, "ElectionFinalized")
        .withArgs(0);
    });

    it("Should split the prize when candidate tie at votes", async function () {
      const {
        voting,
        vesting,
        owner,
        token,
        voter1,
        voter2,
        candidate1,
        candidate2,
        requiredTokenBalance,
      } = await loadFixture(deployVotingFixture);
      await vesting.setAdmin(voting.target, true);
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;

      await voting.createElection(
        "Election1",
        ["Candidate1", "Candidate2"],
        [candidate1.address, candidate2.address],
        startTime,
        endTime
      );
      await time.increaseTo(startTime);

      await token.mint(voting.target, ethers.parseUnits("2000", 18));
      await token.mint(voter1.address, requiredTokenBalance);
      await voting.connect(voter1).register();

      await voting.connect(voter1).vote(0, 0);

      await token.mint(voter2.address, requiredTokenBalance);
      await voting.connect(voter2).register();

      await voting.connect(voter2).vote(0, 1);
      await time.increaseTo(endTime + 1);

      await expect(voting.finalizeElection(0))
        .to.emit(vesting, "VestingAdded")
        .withArgs(
          candidate1.address,
          ethers.parseUnits("500", 18),
          anyValue,
          anyValue
        )
        .to.emit(vesting, "VestingAdded")
        .withArgs(
          candidate2.address,
          ethers.parseUnits("500", 18),
          anyValue,
          anyValue
        );
    });

    it("Should revert if trying to finalize before the election ends", async function () {
      const { voting, candidate1, candidate2 } = await loadFixture(
        deployVotingFixture
      );
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;

      await voting.createElection(
        "Election1",
        ["Candidate1", "Candidate2"],
        [candidate1.address, candidate2.address],
        startTime,
        endTime
      );

      await expect(voting.finalizeElection(0)).to.be.revertedWith(
        "Election is still ongoing"
      );
    });
  });
  describe("TokenVesting", function () {
    it("Should allow an authorized admin to add a vesting schedule", async function () {
      const { vesting, token, owner, voter1 } = await loadFixture(
        deployVotingFixture
      );

      await token.mint(vesting.target, 1000);
      await vesting.setAdmin(owner.address, true);

      await expect(vesting.addVesting(voter1.address, 500)).to.emit(
        vesting,
        "VestingAdded"
      );

      const vestingInfo = await vesting.getVestingInfo(voter1.address);
      expect(vestingInfo.total).to.equal(500);
      expect(vestingInfo.claimed).to.equal(0);
    });

    it("Should not allow unauthorized users to add vesting", async function () {
      const { vesting, voter1, voter2 } = await loadFixture(
        deployVotingFixture
      );
      await expect(
        vesting.connect(voter1).addVesting(voter2.address, 500)
      ).to.be.revertedWith("Not authorized");
    });

    it("Should allow a beneficiary to claim vested tokens", async function () {
      const { vesting, token, voter1 } = await loadFixture(deployVotingFixture);

      await token.mint(vesting.target, 1000);
      await vesting.setAdmin(voter1.address, true);
      await vesting.addVesting(voter1.address, 600);

      await time.increase(90 * 24 * 60 * 60); // Tăng thời gian 3 tháng

      const claimableBefore = await vesting.getClaimableAmount(voter1.address);
      expect(claimableBefore).to.be.gt(0);

      await expect(vesting.connect(voter1).claimTokens())
        .to.emit(vesting, "TokensClaimed")
        .withArgs(voter1.address, claimableBefore);

      const vestingInfo = await vesting.getVestingInfo(voter1.address);
      expect(vestingInfo.claimed).to.equal(claimableBefore);
    });

    it("Should not allow claiming more than vested tokens", async function () {
      const { vesting, token, voter1 } = await loadFixture(deployVotingFixture);

      await token.mint(vesting.target, 1000);
      await vesting.setAdmin(voter1.address, true);
      await vesting.addVesting(voter1.address, 600);

      await expect(vesting.connect(voter1).claimTokens()).to.be.revertedWith(
        "No tokens available for claim"
      );
    });
  });
});
