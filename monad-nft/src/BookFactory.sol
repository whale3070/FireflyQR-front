// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {QuickNFT} from "./QuickNFT.sol";

/// @title BookFactory
/// @dev 出版社通过工厂部署 QuickNFT；部署时传入 baseURI（须以 / 结尾，见 NFT-ASSETS.md）
contract BookFactory {
    address public treasury;
    uint256 public deployFee;

    address[] public deployedBooks;
    mapping(address => address[]) public publisherBooks;

    struct BookInfo {
        string name;
        string symbol;
        string author;
        address publisher;
        uint256 deployedAt;
    }
    mapping(address => BookInfo) public bookInfo;

    event BookDeployed(
        address indexed bookContract,
        address indexed publisher,
        string name,
        string symbol,
        string author
    );
    event DeployFeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    constructor(address _treasury, uint256 _deployFee) {
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;
        deployFee = _deployFee;
    }

    function deployBook(
        string memory bookName,
        string memory symbol,
        string memory authorName,
        string memory baseURI,
        address relayer,
        uint256 pledgeAmount
    ) external payable returns (address) {
        require(msg.value >= deployFee, "Insufficient deploy fee");
        require(bytes(bookName).length > 0, "Book name required");
        require(bytes(symbol).length > 0, "Symbol required");

        QuickNFT newBook = new QuickNFT(
            bookName,
            symbol,
            authorName,
            msg.sender,
            baseURI,
            relayer,
            pledgeAmount
        );

        address bookAddress = address(newBook);

        deployedBooks.push(bookAddress);
        publisherBooks[msg.sender].push(bookAddress);
        bookInfo[bookAddress] = BookInfo({
            name: bookName,
            symbol: symbol,
            author: authorName,
            publisher: msg.sender,
            deployedAt: block.timestamp
        });

        if (msg.value > 0) {
            (bool success, ) = payable(treasury).call{value: msg.value}("");
            require(success, "Transfer failed");
        }

        emit BookDeployed(bookAddress, msg.sender, bookName, symbol, authorName);
        return bookAddress;
    }

    function totalBooks() external view returns (uint256) {
        return deployedBooks.length;
    }

    function getPublisherBooks(address publisher) external view returns (address[] memory) {
        return publisherBooks[publisher];
    }

    function getBookSales(address bookContract) external view returns (uint256) {
        return QuickNFT(payable(bookContract)).totalSales();
    }

    function updateDeployFee(uint256 newFee) external {
        require(msg.sender == treasury, "Only treasury");
        emit DeployFeeUpdated(deployFee, newFee);
        deployFee = newFee;
    }

    function updateTreasury(address newTreasury) external {
        require(msg.sender == treasury, "Only treasury");
        require(newTreasury != address(0), "Invalid address");
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    receive() external payable {}
}
