// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "hardhat/console.sol";

contract DecentralizedVoting is Ownable {
    struct Candidate {
        string name;
        address candidateAddress;
        uint256 voteCount;
    }
    
    struct Election {
        string name;
        uint256 startTime;
        uint256 endTime;
        bool isFinalized;
        Candidate[] candidates;
        mapping(address => bool) hasVoted;
    }

    ERC20 public token;
    uint256 public requiredTokenBalance;
    mapping(uint256 => Election) public elections;
    uint256 public electionCount;
    mapping(address => bool) hasRegistered;

    event ElectionCreated(uint256 indexed electionId, string name, uint256 startTime, uint256 endTime);
    event VoteCast(uint256 indexed electionId, address voter, uint256 candidateIndex);
    event ElectionFinalized(uint256 indexed electionId);

    constructor(address _token, uint256 _requiredTokenBalance) Ownable(msg.sender) {
        token = ERC20(_token);
        requiredTokenBalance = _requiredTokenBalance ;
 
    }

    modifier onlyDuringElection(uint256 _electionId) {
        require(block.timestamp >= elections[_electionId].startTime, "Election has not started");
        require(block.timestamp <= elections[_electionId].endTime, "Election has ended");
        require(!elections[_electionId].isFinalized, "Election is finalized");
        _;
    }

    modifier onlyRegisteredVoter() {
        require(hasRegistered[msg.sender], "Unregistered user");
        _;
    }

    function register() external {
        require(token.balanceOf(msg.sender) >= requiredTokenBalance, "Insufficient token balance to register");
        hasRegistered[msg.sender] = true;
    }

    function createElection(
        string memory _name, 
        string[] memory _candidateNames, 
        address[] memory _candidateAddresses,
        uint256 _startTime,
        uint256 _endTime
    ) external onlyOwner {
        require(_candidateNames.length == _candidateAddresses.length, "Invalid candidates data");
        require(_startTime < _endTime, "Invalid time range");
 
        Election storage newElection = elections[electionCount];
        newElection.name = _name;
        newElection.startTime = _startTime;
        newElection.endTime = _endTime;
        newElection.isFinalized = false;

        for (uint256 i = 0; i < _candidateNames.length; i++) {
            newElection.candidates.push(Candidate({
                name: _candidateNames[i],
                candidateAddress: _candidateAddresses[i],
                voteCount: 0
            }));
        }
        
        emit ElectionCreated(electionCount, _name, _startTime, _endTime);
        electionCount++;
    }

    function vote(uint256 _electionId, uint256 _candidateIndex) external onlyRegisteredVoter onlyDuringElection(_electionId) {
        Election storage election = elections[_electionId];
        require(!election.hasVoted[msg.sender], "You have already voted");
        require(_candidateIndex < election.candidates.length, "Invalid candidate index");

        election.candidates[_candidateIndex].voteCount++;
        election.hasVoted[msg.sender] = true;

        emit VoteCast(_electionId, msg.sender, _candidateIndex);
    }

    function finalizeElection(uint256 _electionId) external onlyOwner {
        require(block.timestamp > elections[_electionId].endTime, "Election is still ongoing");
        elections[_electionId].isFinalized = true;
        emit ElectionFinalized(_electionId);
    }

    function getLeadingCandidate(uint256 _electionId) external view returns (string memory, address, uint256) {
        require(_electionId < electionCount, "Election does not exist");
        Election storage election = elections[_electionId];
        uint256 leadingVotes = 0;
        uint256 leadingIndex = 0;

        for (uint256 i = 0; i < election.candidates.length; i++) {
            if (election.candidates[i].voteCount > leadingVotes) {
                leadingVotes = election.candidates[i].voteCount;
                leadingIndex = i;
            }
        }

        Candidate storage leadingCandidate = election.candidates[leadingIndex];
        return (leadingCandidate.name, leadingCandidate.candidateAddress, leadingCandidate.voteCount);
    }
}
