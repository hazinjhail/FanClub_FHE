pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract FanClubFHE is ZamaEthereumConfig {
    struct Membership {
        euint32 encryptedBalance;
        uint256 publicThreshold;
        string exclusiveContent;
        address memberAddress;
        uint256 joinTimestamp;
        bool isActive;
        uint32 decryptedBalance;
        bool isVerified;
    }

    mapping(string => Membership) public memberships;
    string[] public membershipIds;

    event MembershipCreated(string indexed membershipId, address indexed member);
    event MembershipVerified(string indexed membershipId, uint32 decryptedBalance);
    event ContentUnlocked(string indexed membershipId, string content);

    constructor() ZamaEthereumConfig() {}

    function createMembership(
        string calldata membershipId,
        externalEuint32 encryptedBalance,
        bytes calldata inputProof,
        uint256 publicThreshold,
        string calldata exclusiveContent
    ) external {
        require(bytes(memberships[membershipId].exclusiveContent).length == 0, "Membership already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedBalance, inputProof)), "Invalid encrypted balance");

        memberships[membershipId] = Membership({
            encryptedBalance: FHE.fromExternal(encryptedBalance, inputProof),
            publicThreshold: publicThreshold,
            exclusiveContent: exclusiveContent,
            memberAddress: msg.sender,
            joinTimestamp: block.timestamp,
            isActive: false,
            decryptedBalance: 0,
            isVerified: false
        });

        FHE.allowThis(memberships[membershipId].encryptedBalance);
        FHE.makePubliclyDecryptable(memberships[membershipId].encryptedBalance);
        membershipIds.push(membershipId);

        emit MembershipCreated(membershipId, msg.sender);
    }

    function verifyMembership(
        string calldata membershipId,
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(memberships[membershipId].exclusiveContent).length > 0, "Membership does not exist");
        require(!memberships[membershipId].isVerified, "Membership already verified");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(memberships[membershipId].encryptedBalance);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);
        uint32 decodedBalance = abi.decode(abiEncodedClearValue, (uint32));

        require(decodedBalance >= memberships[membershipId].publicThreshold, "Insufficient balance");

        memberships[membershipId].decryptedBalance = decodedBalance;
        memberships[membershipId].isVerified = true;
        memberships[membershipId].isActive = true;

        emit MembershipVerified(membershipId, decodedBalance);
        emit ContentUnlocked(membershipId, memberships[membershipId].exclusiveContent);
    }

    function getEncryptedBalance(string calldata membershipId) external view returns (euint32) {
        require(bytes(memberships[membershipId].exclusiveContent).length > 0, "Membership does not exist");
        return memberships[membershipId].encryptedBalance;
    }

    function getMembershipData(string calldata membershipId) external view returns (
        uint256 publicThreshold,
        string memory exclusiveContent,
        address memberAddress,
        uint256 joinTimestamp,
        bool isActive,
        bool isVerified,
        uint32 decryptedBalance
    ) {
        require(bytes(memberships[membershipId].exclusiveContent).length > 0, "Membership does not exist");
        Membership storage data = memberships[membershipId];

        return (
            data.publicThreshold,
            data.exclusiveContent,
            data.memberAddress,
            data.joinTimestamp,
            data.isActive,
            data.isVerified,
            data.decryptedBalance
        );
    }

    function getAllMembershipIds() external view returns (string[] memory) {
        return membershipIds;
    }

    function updateExclusiveContent(string calldata membershipId, string calldata newContent) external {
        require(bytes(memberships[membershipId].exclusiveContent).length > 0, "Membership does not exist");
        require(msg.sender == memberships[membershipId].memberAddress, "Only member can update content");

        memberships[membershipId].exclusiveContent = newContent;
    }

    function checkMembershipStatus(string calldata membershipId) external view returns (bool) {
        require(bytes(memberships[membershipId].exclusiveContent).length > 0, "Membership does not exist");
        return memberships[membershipId].isActive;
    }

    function isServiceActive() public pure returns (bool) {
        return true;
    }
}


