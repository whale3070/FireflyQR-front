// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title QuickNFT
/// @dev 书籍 NFT：baseURI + tokenId → metadata JSON（内含 image）。参见仓库内 NFT-ASSETS.md。
contract QuickNFT is ERC721, ReentrancyGuard {
    /// @dev 与 IPFS 元数据份数一致：tokenId 0..10 共 11 枚
    uint256 public constant MAX_SUPPLY = 11;

    uint256 private _nextTokenId;

    string public author;
    address public publisher;
    string private _baseTokenURI;

    uint256 public pledgeAmount;
    mapping(uint256 => uint256) public pledges;
    mapping(uint256 => bool) public listedForSale;

    mapping(address => bool) public authorizedRelayers;

    error NotPublisher();
    error NotAuthorized();
    error InsufficientPledge(uint256 required, uint256 provided);
    error NotOwner(uint256 tokenId);
    error NotListed(uint256 tokenId);
    error CannotBuyOwnNFT();
    error PledgeReleaseFailed(address receiver, uint256 amount);
    error WithdrawFailed(address receiver, uint256 amount);
    error NoBalance();
    error MaxSupplyReached();

    event RelayerAuthorizationChanged(address indexed relayer, bool authorized);
    event PledgeLocked(uint256 tokenId, address indexed payer, uint256 amount);
    event PledgeReleased(uint256 tokenId, address indexed receiver, uint256 amount);
    event Listed(uint256 tokenId, address indexed seller);
    event ListingCancelled(uint256 tokenId, address indexed seller);
    event SoldWithPledge(uint256 tokenId, address indexed seller, address indexed buyer, uint256 amount);
    event EmergencyWithdraw(address indexed publisher, uint256 amount);

    modifier onlyPublisher() {
        if (msg.sender != publisher) revert NotPublisher();
        _;
    }

    modifier onlyAuthorized() {
        if (msg.sender != publisher && !authorizedRelayers[msg.sender]) revert NotAuthorized();
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        string memory author_,
        address publisher_,
        string memory baseURI_,
        address relayer_,
        uint256 pledgeAmount_
    ) ERC721(name_, symbol_) {
        author = author_;
        publisher = publisher_;
        _baseTokenURI = baseURI_;
        pledgeAmount = pledgeAmount_;

        if (relayer_ != address(0)) {
            authorizedRelayers[relayer_] = true;
            emit RelayerAuthorizationChanged(relayer_, true);
        }
    }

    function mint(address to) public payable onlyAuthorized {
        if (_nextTokenId >= MAX_SUPPLY) revert MaxSupplyReached();
        if (msg.value < pledgeAmount) revert InsufficientPledge(pledgeAmount, msg.value);
        uint256 tokenId = _nextTokenId;
        _safeMint(to, tokenId);
        pledges[tokenId] = msg.value;
        unchecked {
            _nextTokenId++;
        }
        emit PledgeLocked(tokenId, msg.sender, msg.value);
    }

    function listForSale(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotOwner(tokenId);
        listedForSale[tokenId] = true;
        emit Listed(tokenId, msg.sender);
    }

    function cancelListing(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotOwner(tokenId);
        listedForSale[tokenId] = false;
        emit ListingCancelled(tokenId, msg.sender);
    }

    function buyWithPledge(uint256 tokenId) external payable nonReentrant {
        if (!listedForSale[tokenId]) revert NotListed(tokenId);
        if (msg.value < pledgeAmount) revert InsufficientPledge(pledgeAmount, msg.value);

        address seller = ownerOf(tokenId);
        if (seller == msg.sender) revert CannotBuyOwnNFT();

        uint256 oldPledge = pledges[tokenId];

        pledges[tokenId] = msg.value;
        listedForSale[tokenId] = false;

        _transfer(seller, msg.sender, tokenId);

        (bool success, ) = payable(seller).call{value: oldPledge}("");
        if (!success) revert PledgeReleaseFailed(seller, oldPledge);

        emit PledgeReleased(tokenId, seller, oldPledge);
        emit PledgeLocked(tokenId, msg.sender, msg.value);
        emit SoldWithPledge(tokenId, seller, msg.sender, msg.value);
    }

    function setRelayer(address relayer, bool authorized) external onlyPublisher {
        authorizedRelayers[relayer] = authorized;
        emit RelayerAuthorizationChanged(relayer, authorized);
    }

    function totalSales() external view returns (uint256) {
        return _nextTokenId;
    }

    function nextTokenId() public view returns (uint256) {
        return _nextTokenId;
    }

    function emergencyWithdraw() external onlyPublisher nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoBalance();

        (bool success, ) = payable(publisher).call{value: balance}("");
        if (!success) revert WithdrawFailed(publisher, balance);

        emit EmergencyWithdraw(publisher, balance);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    receive() external payable {}
}
