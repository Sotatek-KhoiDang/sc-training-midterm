// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenVesting is Ownable {
    IERC20 public immutable token;

    struct VestingSchedule {
        uint256 totalAmount;
        uint256 claimedAmount;
        uint256 startTime;
        uint256 durationMonths;
    }

    mapping(address => VestingSchedule) public vestings;
    mapping(address => bool) public authorizedAdmins;

    event VestingAdded(address indexed beneficiary, uint256 amount, uint256 startTime, uint256 duration);
    event TokensClaimed(address indexed beneficiary, uint256 amount);
    event AdminUpdated(address indexed admin, bool isAuthorized);

    modifier onlyAuthorized() {
        require(authorizedAdmins[msg.sender] || owner() == msg.sender, "Not authorized");
        _;
    }

    constructor(address _token) Ownable(msg.sender) {
        token = IERC20(_token);
    }

    function addVesting(address _beneficiary, uint256 _amount) external onlyAuthorized {
        require(_beneficiary != address(0), "Invalid address");
        require(_amount > 0, "Amount must be greater than 0");
        require(vestings[_beneficiary].totalAmount == 0, "Vesting already exists");

        uint256 startTime = block.timestamp;
        uint256 duration = 10; // 10 months vesting

        vestings[_beneficiary] = VestingSchedule({
            totalAmount: _amount,
            claimedAmount: 0,
            startTime: startTime,
            durationMonths: duration
        });

        emit VestingAdded(_beneficiary, _amount, startTime, duration);
    }

    function claimTokens() external {
        VestingSchedule storage vesting = vestings[msg.sender];
        require(vesting.totalAmount > 0, "No vesting schedule");
        
        uint256 claimable = getClaimableAmount(msg.sender);
        require(claimable > 0, "No tokens available for claim");

        vesting.claimedAmount += claimable;
        require(token.transfer(msg.sender, claimable), "Token transfer failed");

        emit TokensClaimed(msg.sender, claimable);
    }

    function getClaimableAmount(address _beneficiary) public view returns (uint256) {
        VestingSchedule storage vesting = vestings[_beneficiary];
        if (vesting.totalAmount == 0) return 0;

        uint256 monthsElapsed = (block.timestamp - vesting.startTime) / 30 days;
        uint256 totalUnlocked = (vesting.totalAmount * monthsElapsed) / 10;
        
        if (totalUnlocked > vesting.totalAmount) {
            totalUnlocked = vesting.totalAmount;
        }

        return totalUnlocked - vesting.claimedAmount;
    }

    function getVestingInfo(address _beneficiary) external view returns (uint256 total, uint256 claimed, uint256 unlocked) {
        VestingSchedule storage vesting = vestings[_beneficiary];
        total = vesting.totalAmount;
        claimed = vesting.claimedAmount;
        unlocked = getClaimableAmount(_beneficiary) + vesting.claimedAmount;
    }

    function setAdmin(address _admin, bool _isAuthorized) external onlyOwner {
        authorizedAdmins[_admin] = _isAuthorized;
        emit AdminUpdated(_admin, _isAuthorized);
    }
}
