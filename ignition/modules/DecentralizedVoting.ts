// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "hardhat";
const DecentralizedVotingModule = buildModule(
  "DecentralizedVotingModule",
  (m) => {
    const token = m.contract("VotingToken");

    const requiredBalance = ethers.parseUnits("1000", 18);

    const voting = m.contract("DecentralizedVoting", [token, requiredBalance]);

    return { token, voting };
  }
);

export default DecentralizedVotingModule;
